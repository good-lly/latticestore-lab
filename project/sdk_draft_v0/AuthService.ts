import { RedisConfig } from './LatticeStoreService';
import { S3mini } from 's3mini';
import { Accounts, AccountData } from './Accounts';
export class AuthService {
  private _accounts: Accounts;
  constructor(s3: S3mini, redisConfig: RedisConfig) {
    this._accounts = new Accounts(s3, redisConfig);
  }

  public async existingAccountId(accountId: string): Promise<boolean> {
    return this._accounts.existingAccountId(accountId);
  }

  public async createNewAccount(accountId: string, body: any): Promise<{ id: string; result: boolean }> {
    const accountData: AccountData = {
      id: accountId,
      username: body.username,
      email: body.email || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceCount: body.deviceEnvelopes.length || 0,
      devices: body.devices || [],
    };
    const result = await this._accounts.create(accountData.id, accountData, body.deviceEnvelopes, body.deviceListFile);

    return Promise.resolve({ id: accountData.id, result });
  }
}
