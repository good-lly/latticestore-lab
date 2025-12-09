'use strict';

import { makeRequest } from './ApiClient';
import { generateRandomBytes, letscShake256, deriveSeeds, sha256 } from './CryptoUtils';
import { AEAD } from './CryptoAEAD';
import { CryptoPQ } from './CryptoPQ';
import { Members } from './Members';
import { CUSTOM_MANAGER_KEY_STRING, ROLE, VAULT_TYPE } from './Consts.js';
import { Account } from './Account';
import { toUint8Array, genId, uint8ArrayToBase64, now, generateCanonicalJSON } from './Helpers';
import { DEFAULT_AEAD_KEY_LENGTH_BYTES, DEFAULT_SEED_LENGTH_BYTES, RECOVERY_DEVICE_NAME } from './Consts';

import type { VaultId, Base64, Base64Encrypted } from './Consts.js';
import type { RawAEADKey } from './CryptoAEAD';
import type { VaultRegistrationPayload, Vault } from './Vault';

const _verifySecurityContext = async () => {
  const checks = {
    crossOriginIsolated: window.crossOriginIsolated,
    secureContext: window.isSecureContext,
    https: location.protocol === 'https:',
  };

  console.log('Security Context:', checks);

  if (!checks.crossOriginIsolated) {
    console.warn('⚠️ Not cross-origin isolated - vulnerable config');
    console.warn('Check COOP/COEP headers are set correctly');
  }

  if (!checks.secureContext) {
    console.error('❌ Not a secure context - WebCrypto limited');
  }

  return checks;
};

// Data storage structure:
// vault ->  vaultId -> header.json - ONLY owner/admin can write, read for all members, delete only owner
// vault ->  vaultId  -> history -> manifests ... (older full states) ONLY for owner/admin
// vault ->  vaultId -> channels(featureId) -> checkpoint.enc (full state) + patches  ONLY owner/admin/member can write, read for all members, delete only owner/admin
// chunks ->  vaultId -> chunkId  ONLY owner/admin/member can write, read for all members, delete only owner/admin/member

export class LatticeStoreClient {
  private _serviceUrl: string;
  constructor(serviceUrl: string) {
    _verifySecurityContext();
    this._serviceUrl = serviceUrl;
  }
  public async register(
    accountName: string,
    deviceName: string,
    deviceSeed?: Uint8Array,
    service: string = this._serviceUrl,
  ) {
    try {
      // this device seed is either provided by user or randomly generated
      const thisDeviceSeed = deviceSeed ?? generateRandomBytes(DEFAULT_SEED_LENGTH_BYTES);

      // Generate recovery seeds
      const recoverySeed = generateRandomBytes(DEFAULT_SEED_LENGTH_BYTES);

      const masterKey = AEAD.generateRawAEADKeyData();

      const [thisDeviceCredentials, recoveryDeviceCredentials] = await Promise.all([
        Members.createNewCredentials(deviceName.trim(), ROLE.ADMIN, masterKey, thisDeviceSeed),
        Members.createNewCredentials(RECOVERY_DEVICE_NAME, ROLE.OWNER, masterKey, recoverySeed),
      ]);

      const accountId = genId() as VaultId;
      const accountSeed = generateRandomBytes(DEFAULT_SEED_LENGTH_BYTES);
      const { kemSeed, dsaSeed } = deriveSeeds(accountSeed);
      const accountKemKeys = CryptoPQ.generateKemKeys(kemSeed);
      const accountDsaKeys = CryptoPQ.generateDsaKeys(dsaSeed);

      const managersKey = letscShake256(
        masterKey,
        toUint8Array(CUSTOM_MANAGER_KEY_STRING),
        DEFAULT_AEAD_KEY_LENGTH_BYTES,
      ) as RawAEADKey;
      const aeadManagersKey = await AEAD.importAEADKey(managersKey as RawAEADKey);
      accountSeed.fill(0);
      masterKey.fill(0);

      const encryptedAccountSeed = uint8ArrayToBase64(
        await AEAD.encrypt(aeadManagersKey, accountSeed as Uint8Array<ArrayBuffer>),
      ) as Base64Encrypted<Uint8Array>;
      const encryptedMemberList = await Members.encryptMemberList(
        [thisDeviceCredentials.memberEncryptedDetail, recoveryDeviceCredentials.memberEncryptedDetail],
        aeadManagersKey,
      );
      const timestamp = now();

      const registerPayload: VaultRegistrationPayload = {
        version: 1,
        name: accountName.trim(),
        type: VAULT_TYPE.personal,
        id: accountId,
        dsaPubkey: uint8ArrayToBase64(accountDsaKeys.publicKey) as Base64<Uint8Array>,
        kemPubkey: uint8ArrayToBase64(accountKemKeys.publicKey) as Base64<Uint8Array>,
        memberSlots: [thisDeviceCredentials.memberSlot, recoveryDeviceCredentials.memberSlot],
        managerOnlyMemberList: encryptedMemberList,
        managerOnlyArea: encryptedAccountSeed,
        keyEpoch: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      // cleanup here
      kemSeed.fill(0);
      dsaSeed.fill(0);
      managersKey.fill(0);
      accountKemKeys.secretKey.fill(0);
      accountDsaKeys.secretKey.fill(0);
      const payloadSha256uint8Array = (await sha256(
        generateCanonicalJSON(registerPayload),
        'uint8array',
      )) as Uint8Array;
      const registerBody = {
        payload: registerPayload,
        payloadHash: uint8ArrayToBase64(payloadSha256uint8Array),
        signerId: recoveryDeviceCredentials.memberSlot.memberId,
        signature: uint8ArrayToBase64(
          CryptoPQ.sign(recoveryDeviceCredentials.__secrets.dsaSecretKey, payloadSha256uint8Array),
        ),
      } as Vault;

      const response = await makeRequest(`${service}/register`, 'POST', registerBody);
      if (!response.ok) {
        throw new Error(response.message || 'Registration failed');
      }
      return {
        ok: response.ok,
        deviceCredentials: thisDeviceCredentials,
        recoveryDeviceCredentials: recoveryDeviceCredentials,
        recoverySeed: recoverySeed,
        thisDeviceSeed: thisDeviceSeed,
      };
    } catch (error) {
      throw error;
    }
  }

  public async login(accountName: string, deviceSeed: Uint8Array, service: string = this._serviceUrl) {
    try {
      const account = await Account._create(service, accountName, deviceSeed);
      if (!!account) {
        return account;
      }
    } catch (error) {
      throw error;
    }
  }

  // public async login(username: string, thisDeviceMasterSeed: Uint8Array = new Uint8Array()): Promise<Account> {
  //   try {
  //     const { kemSeed, dsaSeed } = CryptoUtils.deriveSeeds(thisDeviceMasterSeed);
  //     // thisDeviceMasterSeed.fill(0);
  //     const thisDeviceCredentials = await DeviceUtils.getDeviceCredentialsFromSeeds(kemSeed, dsaSeed);
  //     const loginPayload: LoginRequest = {
  //       username: username,
  //       deviceId: thisDeviceCredentials.deviceId,
  //     };
  //     const response = (await signedRequest(
  //       `${this.serviceUrl}/login`,
  //       loginPayload,
  //       thisDeviceCredentials.dsaSecretKey,
  //     )) as LoginResponse;
  //     if (!response.ok) {
  //       throw new Error(response.message || 'Login failed');
  //     }
  //     const masterKey = await DeviceUtils.recoverMasterKey(response.deviceEnvelope as ExtendedDeviceEnvelope, kemSeed);
  //     const deviceListKeyMaterial = CryptoUtils.letscShake256(
  //       masterKey,
  //       toUint8Array(CUSTOM_DEVICE_LIST_STRING),
  //       DEFAULT_AEAD_KEY_LENGTH_BYTES,
  //     ) as RawAEADKey;
  //     const featuresListKeyMaterial = CryptoUtils.letscShake256(
  //       masterKey,
  //       toUint8Array(CUSTOM_FEATURES_LIST_STRING),
  //       DEFAULT_AEAD_KEY_LENGTH_BYTES,
  //     ) as RawAEADKey;
  //     const [deviceListKey, featureListKey] = await Promise.all([
  //       AEAD.importAEADKey(deviceListKeyMaterial),
  //       AEAD.importAEADKey(featuresListKeyMaterial),
  //     ]);
  //     const deviceList = JSON.parse(
  //       fromUint8Array(await AEAD.decrypt(deviceListKey, base64ToUint8Array(response.deviceEnvelope.deviceListBase64))),
  //     );

  //     const featuresList = response.featuresList
  //       ? JSON.parse(fromUint8Array(await AEAD.decrypt(featureListKey, base64ToUint8Array(response.featuresList))))
  //       : [];
  //     if (!response.accountInfo.username) {
  //       throw new Error('Username missing in account info');
  //     }
  //     if (thisDeviceCredentials.deviceId !== response.deviceEnvelope.deviceId) {
  //       throw new Error('Device ID mismatch during login');
  //     }
  //     masterKey.fill(0);
  //     deviceListKeyMaterial.fill(0);
  //     featuresListKeyMaterial.fill(0);
  //     kemSeed.fill(0);
  //     dsaSeed.fill(0);
  //     return new Account(
  //       thisDeviceCredentials,
  //       response.accountInfo,
  //       deviceListKey,
  //       deviceList,
  //       featureListKey,
  //       featuresList,
  //       response.authToken,
  //     );
  //   } catch (error) {
  //     throw error;
  //   }
  // }
}
