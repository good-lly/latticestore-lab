import { S3mini, S3Config } from 's3mini';
import { RegisterRequest } from './ApiClient';
import { validateRegistrationRequest } from './Validators';
import { AuthService } from './AuthService';
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
  private _auth: AuthService;

  constructor(S3config: S3Config, redisConfig: RedisConfig) {
    this._s3 = new S3mini(S3config);
    this._redisConfig = redisConfig;
    this._auth = new AuthService(this._s3, this._redisConfig);
  }

  public async register(headers: Headers, body: RegisterRequest): Promise<RegisterResponse> {
    try {
      const isValid = await validateRegistrationRequest(headers, body);
      if (!isValid) {
        throw new Error('Invalid registration request format');
      }
      const newAccountId = uint8ArrayToHex(CryptoUtils.generateRandomBytes(32));
      const alreadyExists = await this._auth.existingAccountId(newAccountId);
      if (alreadyExists) {
        throw new Error('Account ID already exists');
      }
      const account = await this._auth.createNewAccount(newAccountId, body);
      // Notifications.sendWelcomeEmail(account);

      return {
        ok: true,
        status: 'success',
        messages: ['Registration request is valid'],
        reqId: headers.get('X-Request-ID') || undefined,
        accountId: account.id,
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
}
