import { RedisConfig } from './LatticeStoreService';
import { S3mini } from 's3mini';
import { Keyv } from 'keyv';
import { KeyvUpstash } from 'keyv-upstash';
import { DeviceEnvelope } from './DeviceUtils';
import { base64ToBuffer } from './Helpers';

export type AccountData = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  deviceCount: number;
  devices: string[];
};

const ACCOUNT_NAMESPACE = 'ACCOUNT';
const DEVICE_NAMESPACE = 'DEVICE';
const USERNAME_ID = 'USER';

const _getAccountInfoS3Key = (accountId: string) => `${ACCOUNT_NAMESPACE}/${accountId}.json`;
const _usernameToAccountId = (username: string) => `${USERNAME_ID}::${username}`;
const _getDeviceEnvelopeS3Key = (accountId: string, deviceId: string) =>
  `${accountId}/.system/.devices/${deviceId}.json`;
const _getDeviceEnvelopeRedisKey = (accountId: string, deviceId: string) => `${accountId}::device::${deviceId}`;
const _getDeviceListS3Key = (accountId: string) => `${accountId}/.system/device-list.bin`;
const _getDeviceListRedisKey = (accountId: string) => `${accountId}::device-list`;

export class Accounts {
  private _s3: S3mini;
  private _accountsRedis: Keyv;
  private _devicesRedis: Keyv;
  constructor(s3: S3mini, redisConfig: RedisConfig) {
    this._s3 = s3;
    this._accountsRedis = new Keyv({
      store: new KeyvUpstash({
        url: redisConfig.REDIS_URL,
        token: redisConfig.REDIS_TOKEN,
        enableTelemetry: false,
        automaticDeserialization: true,
      }),
      namespace: ACCOUNT_NAMESPACE,
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    });
    this._devicesRedis = new Keyv({
      store: new KeyvUpstash({
        url: redisConfig.REDIS_URL,
        token: redisConfig.REDIS_TOKEN,
        enableTelemetry: false,
        automaticDeserialization: true,
      }),
      namespace: DEVICE_NAMESPACE,
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    });
  }

  public async existingAccountId(accountId: string): Promise<boolean> {
    const accountData = await this._accountsRedis.get(accountId);
    if (accountData === undefined) {
      // Fallback to S3 check
      try {
        const key = _getAccountInfoS3Key(accountId);
        const s3Object = await this._s3.getObject(key);
        if (s3Object) {
          return true;
        }
      } catch (error) {
        return false;
      }
      return false;
    }
    return true;
  }

  public async create(
    accountId: string,
    accountData: AccountData,
    envelopes: DeviceEnvelope[],
    deviceListFile: string,
  ): Promise<boolean> {
    try {
      const deviceListBuffer = base64ToBuffer(deviceListFile);
      const ops = [
        this._accountsRedis.set(accountId, accountData),
        this._accountsRedis.set(_usernameToAccountId(accountData.username), accountId),
        this._s3.putObject(_getAccountInfoS3Key(accountId), JSON.stringify(accountData)),
        this._s3.putObject(_getDeviceListS3Key(accountId), deviceListBuffer),
        this._devicesRedis.set(_getDeviceListRedisKey(accountId), deviceListBuffer),
      ];
      for (const envelope of envelopes) {
        ops.push(this._s3.putObject(_getDeviceEnvelopeS3Key(accountId, envelope.deviceId), JSON.stringify(envelope)));
        ops.push(this._devicesRedis.set(_getDeviceEnvelopeRedisKey(accountId, envelope.deviceId), envelope));
      }
      const results = await Promise.all(ops);
      results.map(res => {
        console.log('Create account op result:', res);
      });
      console.log(`Account ${accountId} created successfully`, ops.length);
      return true;
    } catch (error) {
      throw new Error(`Failed to create account ${accountId}: ${(error as Error).message}`);
    }
  }
}
