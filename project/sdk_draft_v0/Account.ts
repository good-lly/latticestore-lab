// import { AEADCryptoKey } from './CryptoAEAD';

// // import { Feature } from './features/Features';
// import type { FeatureType } from './features/Features';

// // TODO
// // const originalObjects = Object.freeze({
// //   postMessage: self.postMessage.bind(self),
// //   addEventListener: self.addEventListener.bind(self),
// // });

// export class Account {
//   readonly _accountId: string;
//   private _username: string;
//   readonly _deviceId: string;
//   private _deviceName: string;
//   readonly _deviceListKey: AEADCryptoKey;
//   // private _deviceList: DeviceCredentials[];
//   readonly _featureListKey: AEADCryptoKey;
//   private _featuresList: FeatureType[];
//   readonly _createdAt: Date;
//   private _updatedAt: Date;
//   private _authToken: string;

//   constructor(
//     // deviceCredentials: DeviceCredentials,
//     // accountInfo: AccountData,
//     deviceListKey: AEADCryptoKey,
//     // deviceList: DeviceCredentials[],
//     featureListKey: AEADCryptoKey,
//     featuresList: FeatureType[],
//     authToken: string,
//   ) {
//     // this._accountId = accountInfo.accountId;
//     // this._username = accountInfo.username;
//     // this._deviceId = deviceCredentials.deviceId;
//     this._deviceName = deviceList.find(d => d.deviceId === deviceCredentials.deviceId)?.deviceName || 'Unknown Device';
//     this._deviceListKey = deviceListKey;
//     // this._deviceList = deviceList;
//     this._featureListKey = featureListKey;
//     this._featuresList = featuresList;
//     this._createdAt = new Date(accountInfo.createdAt);
//     this._updatedAt = new Date(accountInfo.updatedAt);

//     this._authToken = authToken;
//   }

//   // TODO implement setInfo to update account info on the server
//   async setInfo(key: string, value: string): Promise<boolean> {
//     try {
//       // allowed updating only username, deviceName, additionalPublicUserData and email

//       // Persist the change to the database
//       // await this._accountsRedis.set(this._accountId, this.getAccountInfo());
//       console.log('token', this._authToken, key, value);
//       return true;
//     } catch (error) {
//       console.error(`Failed to set account info for ${this._accountId}: ${error}`);
//       return false;
//     }
//   }

//   getAccountInfo(): any {
//     return {
//       accountId: this._accountId,
//       username: this._username,
//       deviceId: this._deviceId,
//       deviceName: this._deviceName,
//       createdAt: this._createdAt.toISOString(),
//       updatedAt: this._updatedAt.toISOString(),
//       devices: this._deviceList.map(device => device.deviceId),
//       features: this._featuresList,
//     };
//   }

//   getFeaturesList(): FeatureType[] {
//     return this._featuresList;
//   }
// }
