export class Account {
  readonly accountId: string;
  private username: string;
  readonly createdAt: Date;
  private lastLoginAt: Date;

  constructor(accountId: string, username: string, createdAt: Date, lastLoginAt: Date) {
    this.accountId = accountId;
    this.username = username;
    this.createdAt = createdAt;
    this.lastLoginAt = lastLoginAt;
  }

  getUsername(): string {
    return this.username;
  }

  setUsername(newUsername: string): void {
    this.username = newUsername;
  }

  getLastLogin(): Date {
    return this.lastLoginAt;
  }

  updateLastLogin(newLoginDate: Date): void {
    this.lastLoginAt = newLoginDate;
  }
}
