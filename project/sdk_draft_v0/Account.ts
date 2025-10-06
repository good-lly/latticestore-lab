export class Account {
  readonly accountId: string;
  private accountAlias: string;
  readonly createdAt: Date;
  private lastLoginAt: Date;
  readonly accountBio?: string;

  constructor(accountId: string, accountAlias: string, createdAt: Date, lastLoginAt: Date, accountBio?: string) {
    this.accountId = accountId;
    this.accountAlias = accountAlias;
    this.createdAt = createdAt;
    this.lastLoginAt = lastLoginAt;
    this.accountBio = accountBio;
  }
}
