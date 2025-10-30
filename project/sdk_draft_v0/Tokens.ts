import { Keyv } from 'keyv';
import { KeyvUpstash } from 'keyv-upstash';
import { CryptoUtils } from './CryptoUtils';
import { uint8ArrayToHex } from './Helpers';
import { RedisConfig } from './Service';
import { TOKEN_EXPIRATION_SECONDS, TOKEN_LENGTH_BYTES } from './Consts';

const TOKEN_NAMESPACE = 'TOKENS';
export class Tokens {
  private _tokenKeyv: Keyv;

  constructor(redisConfig: RedisConfig) {
    this._tokenKeyv = new Keyv({
      store: new KeyvUpstash({
        url: redisConfig.REDIS_URL,
        token: redisConfig.REDIS_TOKEN,
        enableTelemetry: false,
        automaticDeserialization: false,
      }),
      ttl: TOKEN_EXPIRATION_SECONDS,
      namespace: TOKEN_NAMESPACE,
    });
  }

  public async generateTokenForDevice(deviceId: string): Promise<string> {
    await this.revokeToken(deviceId); // Revoke any existing token
    const token = uint8ArrayToHex(CryptoUtils.generateRandomBytes(TOKEN_LENGTH_BYTES));
    await this._tokenKeyv.set(deviceId, token, TOKEN_EXPIRATION_SECONDS);
    return token;
  }

  public async isValidToken(deviceId: string, providedToken: string): Promise<boolean> {
    const storedToken = await this._tokenKeyv.get(deviceId);
    return storedToken === providedToken;
  }

  public async revokeToken(deviceId: string): Promise<boolean> {
    return await this._tokenKeyv.delete(deviceId);
  }

  public async revokeAllTokens(): Promise<void> {
    await this._tokenKeyv.clear();
  }
}
