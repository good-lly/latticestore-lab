import { CryptoPQ } from './CryptoPQ';
import { deriveSeeds, getMemberIdFromPubkey, sha256 } from './CryptoUtils';
// import type { CryptoPQKeyPair } from './CryptoPQ';
import type { MemberRole, MemberStatus } from './Consts';
// import { createNetworkMonitor } from './NetworkUtils';
import { generateCanonicalJSON, now, uint8ArrayToBase64 } from './Helpers';
import { makeRequest, type LoginPayload, type LoginRequest } from './ApiClient';
import { isValidVaultManifest } from './Validators';

// import { Feature } from './features/Features';
// import type { FeatureType } from './features/Features';

export type AccountState = 'idle' | 'connecting' | 'syncing' | 'ready' | 'paused' | 'disconnected' | 'error';
export type AccountEventMap = {
  statechange: CustomEvent<{ state: AccountState; prev: AccountState }>;
  sync: CustomEvent<{ accountId: string }>;
  error: CustomEvent<{ error: Error }>;
};

export interface AccountInfo {
  memberId: string;
  memberName: string;
  memberRole: MemberRole;
  memberStatus: MemberStatus;
  accountId: string;
  accountName: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export class Account extends EventTarget {
  // private _serviceUrl: string;
  // private _accountName: string;
  // private _deviceSeed: Uint8Array;
  // private _kemKeys: CryptoPQKeyPair;
  // private _dsaKeys: CryptoPQKeyPair;
  // private _networkMonitor = createNetworkMonitor();

  // private _state: AccountState = 'idle';
  // private _error: Error | null = null;
  // private _subscribers = new Set<() => void>();

  // private _authToken: string | null = null;
  // private _rootVaultId: string | null = null;
  // private _masterKey: Uint8Array | null = null;
  // private _memberId: string | null = null;
  // private _memberName: string | null = null;
  // private _memberRole: MemberRole | null = null;
  // private _memberStatus: MemberStatus | null = null;
  // private _createdAt: Date | null = null;
  // private _updatedAt: Date | null = null;
  // private _keyEpoch: number = 0;

  private info: AccountInfo;

  constructor(
    // serviceUrl: string,
    info: AccountInfo,
    // authToken: string,
    // masterKey: Uint8Array,
    // // dsaSecretKey: Uint8Array,
    // deviceSeed: Uint8Array,
  ) {
    super();
    // this._serviceUrl = serviceUrl;
    // this._accountName = info.accountName;
    // this._deviceSeed = deviceSeed;
    // this._authToken = authToken;
    // this._masterKey = masterKey;

    this.info = Object.freeze(info);
  }

  static async _create(serviceUrl: string, accountName: string, deviceSeed: Uint8Array): Promise<Account | null> {
    // this._serviceUrl = serviceUrl;
    // this._accountName = accountName;
    // this._deviceSeed = deviceSeed;
    const { kemSeed, dsaSeed } = deriveSeeds(deviceSeed);
    const kemKeys = CryptoPQ.generateKemKeys(kemSeed);
    const dsaKeys = CryptoPQ.generateDsaKeys(dsaSeed);
    const loginPayload = {
      accountName: accountName.trim(),
      memberId: getMemberIdFromPubkey(dsaKeys.publicKey),
      timestamp: now(),
    } as LoginPayload;
    const payloadSha256uint8Array = (await sha256(generateCanonicalJSON(loginPayload), 'uint8array')) as Uint8Array;
    const loginBody = {
      payload: loginPayload,
      payloadHash: uint8ArrayToBase64(payloadSha256uint8Array),
      signerId: loginPayload.memberId,
      signature: uint8ArrayToBase64(CryptoPQ.sign(dsaKeys.secretKey, payloadSha256uint8Array)),
    } as LoginRequest;
    const response = await makeRequest(`${serviceUrl}/login`, 'POST', loginBody);
    if (!response.ok) {
      throw new Error(response.message || 'Login failed');
    }
    // validate vault payload and extract account info
    const vaultManifest = response.accountVault;
    if (!isValidVaultManifest(vaultManifest) || vaultManifest.payload.name !== accountName) {
      throw new Error('Invalid vault manifest received from server');
    }
    return null;
  }

  // TODO implement setInfo to update account info on the server
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
}
