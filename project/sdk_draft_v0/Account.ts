import { AccountData } from './Accounts';
import { AEADCryptoKey } from './CryptoAEAD';
import { DeviceCredentials } from './DeviceUtils';

export class Account {
  readonly _accountId: string;
  private _username: string;
  private _deviceList: any[];
  private _featuresList: any[];
  readonly _createdAt: Date;
  private _updatedAt: Date;
  readonly _aeadKey: AEADCryptoKey;

  constructor(
    deviceCredentials: DeviceCredentials,
    accountInfo: AccountData,
    deviceList: any[],
    featuresList: any[],
    key: AEADCryptoKey,
  ) {
    this._accountId = deviceCredentials.deviceId;
    this._username = accountInfo.username;
    this._deviceList = deviceList;
    this._featuresList = featuresList;
    this._createdAt = new Date(accountInfo.createdAt);
    this._updatedAt = new Date(accountInfo.updatedAt);
    this._aeadKey = key;
  }
}
