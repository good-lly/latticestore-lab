import { S3mini, S3Config } from 's3mini';
import { RegisterRequest, LoginRequest, LoginResponse } from './ApiClient';
import { validateRegistrationRequest, validateLoginRequest, isValidSignature } from './Validators';
import { AccountData, Accounts } from './Accounts';
import { CryptoUtils } from './CryptoUtils';
import { uint8ArrayToHex } from './Helpers';

export type RedisConfig = {
  REDIS_URL: string;
  REDIS_TOKEN: string;
};

export type RegisterResponse = {
  ok: boolean;
  status: 'success' | 'warning' | 'error';
  messages: string[];
  reqId?: string | undefined;
  accountId: string;
  code?: number;
};

export class LatticeStoreService {
  private _s3: S3mini;
  private _redisConfig: RedisConfig;
  private _accounts: Accounts;

  constructor(S3config: S3Config, redisConfig: RedisConfig) {
    this._s3 = new S3mini(S3config);
    this._redisConfig = redisConfig;
    this._accounts = new Accounts(this._s3, this._redisConfig);
    // this._auth = new AuthService(this._s3, this._redisConfig);
  }

  public async register(headers: Headers, body: RegisterRequest): Promise<RegisterResponse> {
    try {
      const isValid = await validateRegistrationRequest(headers, body);
      if (!isValid) {
        throw new Error('Invalid registration request format');
      }
      const newAccountId = uint8ArrayToHex(CryptoUtils.generateRandomBytes(32)).toLowerCase();
      const alreadyExistsAndUsername = await this._accounts.existingAccount(newAccountId, body.username);
      if (alreadyExistsAndUsername) {
        throw new Error('Account name or ID already exists');
      }
      const accountData: AccountData = {
        accountId: newAccountId,
        username: body.username,
        email: body.email || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deviceCount: body.deviceEnvelopes.length || 0,
        devices: body.devices || [],
      };
      const account = await this._accounts.create(accountData, body.deviceEnvelopes, body.deviceListFile);

      // const account = await this._auth.createNewAccount(newAccountId, body);
      // Notifications.sendWelcomeEmail(account);

      return {
        ok: true,
        status: 'success',
        messages: ['Registration request is valid'],
        reqId: headers.get('X-Request-ID') || undefined,
        accountId: newAccountId,
        code: 200,
      };
    } catch (error) {
      // throw new Error(`Registration request validation failed: ${(error as Error).message}`);
      return {
        ok: false,
        status: 'error',
        accountId: '',
        messages: [
          `Registration request validation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        ],
        reqId: headers.get('X-Request-ID') || undefined,
        code: 400,
      };
    }
  }
  public async login(headers: Headers, body: LoginRequest): Promise<LoginResponse> {
    try {
      const isValid = await validateLoginRequest(headers, body);
      if (!isValid) {
        throw new Error('Invalid login request format');
      }
      const accountId = await this._accounts.getAccountIdByUsername(body.username);
      if (!accountId || accountId.length === 0 || accountId === null) {
        throw new Error('Username does not exist');
      }
      const devicePublicKeyBase64 = await this._accounts.getDevicePublicKey(accountId, body.deviceId);
      if (!devicePublicKeyBase64 || devicePublicKeyBase64.length === 0 || devicePublicKeyBase64 === null) {
        throw new Error('Device does not exist');
      }
      const isValidSig = isValidSignature(headers, devicePublicKeyBase64);
      if (!isValidSig) {
        throw new Error('Invalid signature for login');
      }
      return {
        ok: true,
        accountId,
        deviceListFile: await this._accounts.getDeviceListFile(accountId),
        deviceEnvelope: await this._accounts.getDeviceEnvelope(accountId, body.deviceId),
      };
    } catch (error) {
      throw new Error(`Login request validation failed: ${(error as Error).message}`);
    }
  }
}
