import { S3mini } from 's3mini';
import type { RedisConfig } from '../Service';
import { AccountData, ACCOUNT_NAMESPACE, DEVICE_NAMESPACE } from '../Accounts';
import { Tokens } from '../Tokens';
import { Keyv } from '@keyv/redis';
import { KeyvUpstash } from 'keyv-upstash';

interface ListObject {
  Key: string;
  Size: number;
  LastModified: Date;
  ETag: string;
  StorageClass: string;
}

// ONLY FOR DEVELOPMENT AND TESTING PURPOSES
export class Admin {
  public static async listAccounts(
    s3: S3mini,
    redisConfig: RedisConfig,
  ): Promise<{ accounts: AccountData[]; allS3File: string[] | null }> {
    const _accountsRedis = new Keyv({
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
    const allS3File = (await s3.listObjects()) as string[] | null;
    // const _devicesRedis = new Keyv({
    //   store: new KeyvUpstash({
    //     url: redisConfig.REDIS_URL,
    //     token: redisConfig.REDIS_TOKEN,
    //     enableTelemetry: false,
    //     automaticDeserialization: true,
    //   }),
    //   namespace: DEVICE_NAMESPACE,
    //   serialize: JSON.stringify,
    //   deserialize: JSON.parse,
    // });
    let accounts: AccountData[] = [];
    if (!(_accountsRedis && typeof _accountsRedis.iterator === 'function')) {
      return { accounts, allS3File };
    }
    // @ts-ignore
    for await (const [key, value] of _accountsRedis.iterator()) {
      console.log('key', key);
      accounts.push(value as AccountData);
    }
    return { accounts, allS3File };
  }

  public static async deleteAll(s3: S3mini, redisConfig: RedisConfig): Promise<void> {
    const _accountsRedis = new Keyv({
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
    const _devicesRedis = new Keyv({
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
    const _tokens = new Tokens(redisConfig);
    await _tokens.revokeAllTokens();
    if (_accountsRedis && typeof _accountsRedis.clear === 'function') {
      await _accountsRedis.clear();
    }
    if (_devicesRedis && typeof _devicesRedis.clear === 'function') {
      await _devicesRedis.clear();
    }
    const allS3File = (await s3.listObjects()) as ListObject[] | null;
    if (allS3File && allS3File.length > 0) {
      // reduce allS3File to array of keys []
      await s3.deleteObjects(allS3File.map(obj => obj.Key));
    }
    return;
  }

  //   public static deleteAccount(accountId: string) {}

  //   public static deleteAllAccounts() {}
}
