export class Account {
  readonly accountId: string;
  private accountAlias: string;
  readonly createdAt: Date;
  private lastLoginAt: Date;

  constructor(accountId: string, accountAlias: string, createdAt: Date, lastLoginAt: Date) {
    this.accountId = accountId;
    this.accountAlias = accountAlias;
    this.createdAt = createdAt;
    this.lastLoginAt = lastLoginAt;
  }

  getAlias(): string {
    return this.accountAlias;
  }

  setAlias(newAlias: string): void {
    this.accountAlias = newAlias;
  }

  getLastLogin(): Date {
    return this.lastLoginAt;
  }

  updateLastLogin(newLoginDate: Date): void {
    this.lastLoginAt = newLoginDate;
  }
}
