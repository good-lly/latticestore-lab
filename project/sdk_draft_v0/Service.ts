import { S3mini, S3Config } from 's3mini';
import { RegisterRequest, RegisterResponse, LoginRequest, LoginResponse } from './ApiClient';
import { validateRegistrationRequest, validateLoginRequest, isValidSignature } from './Validators';
import { AccountData, Accounts } from './Accounts';
import { Tokens } from './Tokens';
import { CryptoUtils } from './CryptoUtils';
import { uint8ArrayToHex } from './Helpers';
import { Admin } from './admin/Admin';

export type RedisConfig = {
  REDIS_URL: string;
  REDIS_TOKEN: string;
};

export class LatticeStoreService {
  private _s3: S3mini;
  private _redisConfig: RedisConfig;
  private _accounts: Accounts;
  private _tokens: Tokens;

  constructor(S3config: S3Config, redisConfig: RedisConfig) {
    this._s3 = new S3mini(S3config);
    this._redisConfig = redisConfig;
    this._accounts = new Accounts(this._s3, this._redisConfig);
    this._tokens = new Tokens(this._redisConfig);
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
        otherPublicUserData: body.otherPublicUserData || [],
      };
      const account = await this._accounts.create(accountData, body.deviceEnvelopes, body.deviceListFile);

      // const account = await this._auth.createNewAccount(newAccountId, body);
      // Notifications.sendWelcomeEmail(account);

      return {
        ok: account,
        message: `Registration request ${account ? 'successful' : 'failed'}`,
        reqId: headers.get('X-Request-ID') || '',
        code: 200,
      };
    } catch (error) {
      // throw new Error(`Registration request validation failed: ${(error as Error).message}`);
      return {
        ok: false,
        message: `Registration request validation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        reqId: headers.get('X-Request-ID') || '',
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
      const { accountId, deviceEnvelope } = await this._accounts.getAccountByUsernamePlusDeviceId(
        body.username,
        body.deviceId,
      );
      if (!accountId || accountId.length === 0 || accountId === null) {
        throw new Error('Username does not exist');
      }
      const [accountInfo, featuresList] = await Promise.all([
        this._accounts.getAccountData(accountId),
        this._accounts.getFeaturesList(accountId),
      ]);
      if (!deviceEnvelope || !accountInfo) {
        throw new Error('Fuckup, Device or account does not exist');
      }
      if (!isValidSignature(headers, deviceEnvelope.dsaPublicKeyBase64)) {
        throw new Error('Invalid signature for login');
      }

      return {
        ok: true,
        accountInfo: accountInfo as AccountData,
        deviceEnvelope: deviceEnvelope,
        featuresList: featuresList,
        authToken: await this._tokens.generateTokenForDevice(body.deviceId),
        reqId: headers.get('X-Request-ID') || '',
        code: 200,
      };
    } catch (error) {
      throw new Error(`Login request validation failed: ${(error as Error).message}`);
    }
  }

  // ONLY FOR DEVELOPMENT AND TESTING PURPOSES
  public async listAll(): Promise<{ accounts: AccountData[]; allS3File: string[] | null }> {
    const data = (await Admin.listAccounts(this._s3, this._redisConfig)) as {
      accounts: AccountData[];
      allS3File: string[] | null;
    };
    return data;
  }

  public async deleteAll(): Promise<{ accounts: AccountData[]; allS3File: string[] | null }> {
    await Admin.deleteAll(this._s3, this._redisConfig);
    const data = (await Admin.listAccounts(this._s3, this._redisConfig)) as {
      accounts: AccountData[];
      allS3File: string[] | null;
    };
    return data;
  }
}
