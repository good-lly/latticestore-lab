import { AccountData } from './Accounts';
import { AEADCryptoKey } from './CryptoAEAD';
import { DeviceCredentials } from './DeviceUtils';
import { FeatureType } from './features/Features';

export class Account {
  readonly _accountId: string;
  private _username: string;
  readonly _deviceId: string;
  private _deviceName: string;
  private _deviceList: DeviceCredentials[];
  private _featuresList: FeatureType[];
  readonly _createdAt: Date;
  private _updatedAt: Date;
  readonly _aeadKey: AEADCryptoKey;
  private _authToken: string;

  constructor(
    deviceCredentials: DeviceCredentials,
    accountInfo: AccountData,
    deviceList: DeviceCredentials[],
    featuresList: FeatureType[],
    key: AEADCryptoKey,
    authToken: string,
  ) {
    this._accountId = accountInfo.accountId;
    this._username = accountInfo.username;
    this._deviceId = deviceCredentials.deviceId;
    this._deviceName = deviceCredentials.deviceName || '';
    this._deviceList = deviceList;
    this._featuresList = featuresList;
    this._createdAt = new Date(accountInfo.createdAt);
    this._updatedAt = new Date(accountInfo.updatedAt);
    this._aeadKey = key;
    this._authToken = authToken;
  }

  // TODO implement setInfo to update account info on the server
  async setInfo(key: string, value: string): Promise<boolean> {
    try {
      // allowed updating only username, deviceName, additionalPublicUserData and email

      // Persist the change to the database
      // await this._accountsRedis.set(this._accountId, this.getAccountInfo());
      console.log('token', this._authToken, key, value);
      return true;
    } catch (error) {
      console.error(`Failed to set account info for ${this._accountId}: ${error}`);
      return false;
    }
  }

  getAccountInfo(): any {
    return {
      accountId: this._accountId,
      username: this._username,
      deviceId: this._deviceId,
      deviceName: this._deviceName,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      devices: this._deviceList.map(device => device.deviceId),
      features: this._featuresList,
    };
  }
}
