import { S3mini, S3Config } from 's3mini';
import type { RegisterResponse } from './ApiClient';
import type { Vault } from './Vault';
import { validateRegistrationRequest } from './Validators';
import { Accounts } from './Accounts';
import { Admin } from './admin/Admin';
import { VAULTS_NAMESPACE } from './Consts';
import { Keyv } from 'keyv';
import type { KeyvStoreAdapter } from 'keyv';

export class LatticeStoreService {
  private _s3: S3mini;
  private _vaultRedis: Keyv;
  private _accounts: Accounts;

  constructor(S3config: S3Config, keyvAdapter: KeyvStoreAdapter) {
    this._s3 = new S3mini(S3config);
    this._vaultRedis = new Keyv({
      store: keyvAdapter,
      useKeyPrefix: false,
      namespace: VAULTS_NAMESPACE,
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    });
    this._accounts = new Accounts(this._s3, this._vaultRedis);
  }

  public async register(body: Vault): Promise<RegisterResponse> {
    try {
      const [validated, existingId, existingName] = await Promise.all([
        validateRegistrationRequest(body),
        this._accounts.existingId(body.payload.id),
        this._accounts.existingName(body.payload.name),
      ]);
      if (!validated) {
        throw new Error('Invalid registration request format');
      }
      if (existingId || existingName) {
        throw new Error('Vault ID or name already exists');
      }
      return {
        ok: await this._accounts.createAccount(body),
        message: 'Vault registration successful',
        code: 200,
      };
    } catch (error) {
      return {
        ok: false,
        message: `Registration request failed: ${(error as Error).message}`,
        code: 400,
      };
    }
  }

  // public async login(body: LoginRequest): Promise<LoginResponse> {
  //   try {
  //     const isValid = await validateLoginRequest(body);
  //     if (!isValid) {
  //       throw new Error('Invalid login request format');
  //     }
  //     const { accountId, deviceEnvelope } = await this._accounts.getAccountByUsernamePlusDeviceId(
  //       body.username,
  //       body.deviceId,
  //     );
  //     if (!accountId || accountId.length === 0 || accountId === null) {
  //       throw new Error('Username does not exist');
  //     }
  //     const [accountInfo, featuresList] = await Promise.all([
  //       this._accounts.getAccountData(accountId),
  //       this._accounts.getFeaturesList(accountId),
  //     ]);
  //     if (!deviceEnvelope || !accountInfo) {
  //       throw new Error('Fuckup, Device or account does not exist');
  //     }
  //     if (!isValidSignature(headers, deviceEnvelope.dsaPublicKeyBase64)) {
  //       throw new Error('Invalid signature for login');
  //     }

  //     return {
  //       ok: true,
  //       accountInfo: accountInfo as AccountData,
  //       deviceEnvelope: deviceEnvelope,
  //       featuresList: featuresList,
  //       authToken: await this._tokens.generateTokenForDevice(body.deviceId),
  //       reqId: headers.get('X-Request-ID') || '',
  //       code: 200,
  //     };
  //   } catch (error) {
  //     throw new Error(`Login request validation failed: ${(error as Error).message}`);
  //   }
  // }

  // // ONLY FOR DEVELOPMENT AND TESTING PURPOSES
  // public async listAll(): Promise<{ accounts: AccountData[]; allS3File: string[] | null }> {
  //   const data = (await Admin.listAccounts(this._s3, this._redisConfig)) as {
  //     accounts: AccountData[];
  //     allS3File: string[] | null;
  //   };
  //   return data;
  // }

  public async deleteAll(): Promise<{ accounts: Record<string, any>[]; allS3File: string[] | null }> {
    await Admin.deleteAll(this._s3, this._vaultRedis);
    const data = (await Admin.listAccounts(this._s3, this._vaultRedis)) as {
      accounts: Record<string, any>[];
      allS3File: string[] | null;
    };
    return data;
  }
}
