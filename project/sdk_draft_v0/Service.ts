import { S3mini } from 's3mini';
import { validateRegistrationRequest, validateLoginRequest } from './Validators';
import { Accounts } from './Accounts';
import { Admin } from './admin/Admin';
import { Tokens } from './Tokens';
import { VAULTS_NAMESPACE } from './Consts';
import { Keyv } from 'keyv';

import type { S3Config } from 's3mini';
import type { KeyvStoreAdapter } from 'keyv';
import type { RegisterResponse, LoginRequest, LoginResponse } from './ApiClient';
import type { Vault } from './Vault';

export class LatticeStoreService {
  readonly #s3: S3mini;
  readonly #vaultRedis: Keyv;
  readonly #accounts: Accounts;
  readonly #tokens: Tokens;

  constructor(S3config: S3Config, keyvAdapter: KeyvStoreAdapter) {
    this.#s3 = new S3mini(S3config);
    this.#vaultRedis = new Keyv({
      store: keyvAdapter,
      useKeyPrefix: false,
      namespace: VAULTS_NAMESPACE,
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    });
    this.#accounts = new Accounts(this.#s3, this.#vaultRedis);
    this.#tokens = new Tokens(keyvAdapter);
  }

  public async register(body: Vault): Promise<RegisterResponse> {
    try {
      const [validated, existingId, existingName] = await Promise.all([
        validateRegistrationRequest(body),
        this.#accounts.existingId(body.payload.id),
        this.#accounts.existingName(body.payload.name),
      ]);
      if (!validated) {
        throw new Error('Invalid registration request format');
      }
      if (existingId || existingName) {
        throw new Error('Name or ID already exists!');
      }
      return {
        ok: await this.#accounts.createAccount(body),
        message: 'Registration successful',
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

  public async login(body: LoginRequest): Promise<LoginResponse> {
    try {
      const vaultManifest = await this.#accounts.getPersonalVaultIdByName(body.payload.accountName);
      if (!vaultManifest) {
        throw new Error('Account does not exist! You are reported!');
      }

      const validated = await validateLoginRequest(body, vaultManifest);
      if (!validated) {
        throw new Error('Invalid login');
      }
      const token = await this.#tokens.generateTokenForMemberAndVault(body.payload.memberId, vaultManifest.payload.id);
      return {
        ok: true,
        accountVault: vaultManifest,
        authToken: token,
        message: 'Login successful',
        code: 200,
      };
    } catch (error) {
      return {
        ok: false,
        message: `Login request failed: ${(error as Error).message}`,
        code: 400,
      };
    }
  }

  // // ONLY FOR DEVELOPMENT AND TESTING PURPOSES
  // public async listAll(): Promise<{ accounts: AccountData[]; allS3File: string[] | null }> {
  //   const data = (await Admin.listAccounts(this._s3, this._redisConfig)) as {
  //     accounts: AccountData[];
  //     allS3File: string[] | null;
  //   };
  //   return data;
  // }

  public async deleteAll(): Promise<{ accounts: Record<string, any>[]; allS3File: string[] | null }> {
    await Admin.deleteAll(this.#s3, this.#vaultRedis);
    const data = (await Admin.listAccounts(this.#s3, this.#vaultRedis)) as {
      accounts: Record<string, any>[];
      allS3File: string[] | null;
    };
    return data;
  }
}
