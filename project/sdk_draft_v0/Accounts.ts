import { RedisConfig } from './Service';
import { S3mini } from 's3mini';
import { Keyv } from 'keyv';
import { KeyvUpstash } from 'keyv-upstash';
import { DeviceEnvelope, ExtendedDeviceEnvelope } from './DeviceUtils';

export type AccountData = {
  accountId: string;
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
const _usernameToAccountIdS3Key = (username: string) => `${USERNAME_ID}/${username}.txt`;

const _accountFeaturesListS3Key = (accountId: string) => `${accountId}/.system/features`;
const _accountFeaturesListRedisKey = (accountId: string) => `${accountId}::features`;

const _getDeviceEnvelopeS3Key = (accountId: string, deviceId: string) =>
  `${accountId}/.system/.devices/${deviceId}.json`;
const _getDeviceEnvelopeRedisKey = (accountId: string, deviceId: string) => `${accountId}::device::${deviceId}`;
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

  public async existingAccount(accountId: string, username: string): Promise<boolean> {
    const accountData = await this._accountsRedis.get(accountId);
    const existingUsername = await this._accountsRedis.get(_usernameToAccountId(username));
    if (existingUsername !== undefined) {
      return true;
    }
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

  public async create(accountData: AccountData, envelopes: DeviceEnvelope[], deviceListFile: string): Promise<boolean> {
    try {
      // on account create, we need to store:
      // 1. account data (account informations) in redis and s3
      // 2. username to accountId mapping in redis and s3
      // 3. each device envelope in redis and s3, with deviceListBase64 included
      const ops = [
        this._accountsRedis.set(accountData.accountId, accountData),
        this._s3.putObject(_getAccountInfoS3Key(accountData.accountId), JSON.stringify(accountData)),
        this._accountsRedis.set(_usernameToAccountId(accountData.username), accountData.accountId),
        this._s3.putObject(_usernameToAccountIdS3Key(accountData.username), accountData.accountId),
      ];
      for (const envelope of envelopes) {
        const extendedEnvelope = {
          ...envelope,
          deviceListBase64: deviceListFile,
        };
        ops.push(
          this._s3.putObject(
            _getDeviceEnvelopeS3Key(accountData.accountId, envelope.deviceId),
            JSON.stringify(extendedEnvelope),
          ),
        );
        ops.push(
          this._devicesRedis.set(
            _getDeviceEnvelopeRedisKey(accountData.accountId, envelope.deviceId),
            extendedEnvelope,
          ),
        );
      }
      await Promise.all(ops);
      console.log(`Account ${accountData.accountId} created successfully`, ops.length);
      return true;
    } catch (error) {
      throw new Error(`Failed to create account ${accountData.accountId}: ${(error as Error).message}`);
    }
  }

  public async getAccountIdByUsername(username: string): Promise<string | null> {
    const accountId = await this._accountsRedis.get(_usernameToAccountId(username));
    if (accountId !== undefined) {
      return accountId;
    }
    // Fallback to S3 check
    try {
      const accountId = _usernameToAccountIdS3Key(username);
      if (accountId !== undefined || accountId !== null) {
        return accountId;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  public async getDeviceEnvelope(accountId: string, deviceId: string): Promise<ExtendedDeviceEnvelope | null> {
    const envelope: ExtendedDeviceEnvelope | undefined = await this._devicesRedis.get(
      _getDeviceEnvelopeRedisKey(accountId, deviceId),
    );
    if (envelope !== undefined) {
      return envelope;
    }
    // Fallback to S3 check
    try {
      const key = _getDeviceEnvelopeS3Key(accountId, deviceId);
      const s3Object = await this._s3.getObject(key);
      if (s3Object) {
        return JSON.parse(s3Object);
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  public async getDevicePublicKey(accountId: string, deviceId: string): Promise<string | null> {
    const envelope: DeviceEnvelope | undefined = await this._devicesRedis.get(
      _getDeviceEnvelopeRedisKey(accountId, deviceId),
    );
    if (envelope !== undefined) {
      return envelope.dsaPublicKeyBase64;
    }
    // Fallback to S3 check
    try {
      const key = _getDeviceEnvelopeS3Key(accountId, deviceId);
      const s3Object = await this._s3.getObject(key);
      if (s3Object) {
        const envelope: DeviceEnvelope = JSON.parse(s3Object);
        return envelope.dsaPublicKeyBase64;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  public async getAccountData(accountId: string): Promise<AccountData | null> {
    const accountData: AccountData | undefined = await this._accountsRedis.get(accountId);
    if (accountData !== undefined) {
      return accountData;
    }
    // Fallback to S3 check
    try {
      const key = _getAccountInfoS3Key(accountId);
      const s3Object = await this._s3.getObject(key);
      if (s3Object) {
        return JSON.parse(s3Object);
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  public async getFeaturesList(accountId: string): Promise<string | null> {
    const featuresList: string | undefined = await this._accountsRedis.get(_accountFeaturesListRedisKey(accountId));
    if (featuresList !== undefined) {
      return featuresList;
    }
    try {
      const key = _accountFeaturesListS3Key(accountId);
      const s3Object = await this._s3.getObject(key);
      if (s3Object) {
        return s3Object;
      }
    } catch (error) {
      return null;
    }
    return null;
  }
}
