import { RegisterRequest } from './ApiClient';
import { S3Config } from 's3mini';
import { validateRegistrationRequest } from './Validators';
import { S3mini } from 's3mini';
// import { Keyv, KeyvHooks } from 'keyv';
// import { KeyvUpstash } from 'keyv-upstash';

type RedisConfig = {
  REDIS_URL: string;
  REDIS_TOKEN: string;
};

type RegisterResponse = {
  ok: boolean;
  status: 'success' | 'warning' | 'error';
  messages?: string[];
  reqId?: string | undefined;
  code?: number;
};

export class LatticeStoreService {
  private _s3: S3mini;
  private _redisConfig: RedisConfig;

  constructor(S3config: S3Config, redisConfig: RedisConfig) {
    this._s3 = new S3mini(S3config);
    this._redisConfig = redisConfig;
  }

  public static async handleRegisterRequest(headers: Headers, body: RegisterRequest): Promise<RegisterResponse> {
    try {
      const isValid = await validateRegistrationRequest(headers, body);
      if (!isValid) {
        throw new Error('Invalid registration request format');
      }
      return {
        ok: true,
        status: 'success',
        messages: ['Registration request is valid'],
        reqId: headers.get('X-Request-ID') || undefined,
        code: 200,
      };
    } catch (error) {
      // throw new Error(`Registration request validation failed: ${(error as Error).message}`);
      return {
        ok: false,
        status: 'error',
        messages: [
          `Registration request validation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        ],
        reqId: headers.get('X-Request-ID') || undefined,
        code: 400,
      };
    }
  }
}
