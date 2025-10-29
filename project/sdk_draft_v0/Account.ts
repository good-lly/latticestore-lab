import { AccountData } from './Accounts';
import { AEADCryptoKey } from './CryptoAEAD';
import { DeviceCredentials } from './DeviceUtils';
import { FeatureType } from './features/Features';

export class Account {
  readonly _accountId: string;
  private _username: string;
  private _deviceList: Set<DeviceCredentials>;
  private _featuresList: Set<FeatureType>;
  readonly _createdAt: Date;
  private _updatedAt: Date;
  readonly _aeadKey: AEADCryptoKey;
  private _authToken: string;

  constructor(
    deviceCredentials: DeviceCredentials,
    accountInfo: AccountData,
    deviceList: Set<DeviceCredentials>,
    featuresList: Set<FeatureType>,
    key: AEADCryptoKey,
    authToken: string,
  ) {
    this._accountId = deviceCredentials.deviceId;
    this._username = accountInfo.username;
    this._deviceList = deviceList;
    this._featuresList = featuresList;
    this._createdAt = new Date(accountInfo.createdAt);
    this._updatedAt = new Date(accountInfo.updatedAt);
    this._aeadKey = key;
    this._authToken = authToken;
  }
}
