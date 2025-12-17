import type { VaultId, VaultType, MemberId, Base64, Timestamp, Base64Encrypted } from './Consts.js';
import type { MemberEncryptedDetail, MemberInfoBasics, MemberSlot } from './Members.js';
import type { Feature } from './features/Features';
import type { AEADCryptoKey, RawAEADKey } from './CryptoAEAD.js';

import { IS_MANAGER_ROLE } from './Consts.js';
import { getManagerKey, decryptMemberList, getFeaturesKey } from './Members.js';
import { FeatureController } from './features/Features.js';
import { CryptoPQ } from './CryptoPQ.js';
import { AEAD } from './CryptoAEAD.js';
import { getMemberFromMemberSlots } from './Validators.js';
import { base64ToUint8Array, fromUint8Array } from './Helpers.js';

export type VaultRegistrationPayload = {
  version: number;
  name: string; // mutable, can be changed by owner/admin
  type: VaultType; // personal or team(TBD) [TODO]
  id: VaultId; // redundant but useful for verification
  dsaPubkey: Base64<Uint8Array>; // for signature verification of manifests
  kemPubkey: Base64<Uint8Array>; // for key encapsulation
  memberSlots: MemberSlot[];
  managerOnlyMemberList: Base64Encrypted<MemberEncryptedDetail[]>; // managers only access
  managerOnlyArea: Base64Encrypted<Uint8Array>; // placeholder for future manager-only data
  keyEpoch: number; // increments when vault keys are rotated
  featuresEncrypted?: Base64Encrypted<Feature[]>; // Just pointers to feature channels, not feature state
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Vault = {
  payload: VaultRegistrationPayload;
  payloadHash: Base64<Uint8Array>;
  signerId: MemberId;
  signature: Base64<Uint8Array>;
};

export class VaultController {
  #vaultManifest: Vault;
  #etag: string;
  #authToken: string | null = null;
  #aeadVaultKey: AEADCryptoKey | null = null;
  #vaultUnlocked: boolean = false;
  #activeMember: MemberInfoBasics | null = null;
  #isManagerMember: boolean = false;
  #managersArea: { memberList: MemberEncryptedDetail[]; key: AEADCryptoKey } | null = null;
  #featuresKey: AEADCryptoKey | null = null;
  #features: FeatureController[] = [];
  // #tasker: Tasker | null = null;
  constructor(vault: Vault, etag: string, authToken: string) {
    this.#vaultManifest = vault;
    this.#etag = etag;
    this.#authToken = authToken;
  }
  async unlockMember(member: MemberInfoBasics): Promise<boolean> {
    const memberSlot = getMemberFromMemberSlots(this.#vaultManifest.payload.memberSlots, member.memberId);
    if (memberSlot) {
      // unwrap aead key
      const cipherText = base64ToUint8Array(memberSlot.memberKemCiphertext);
      const sharedKeyRaw = CryptoPQ.decapsulate(cipherText, member.kemKeys.secretKey);
      const sharedKey = await AEAD.importAEADKey(sharedKeyRaw as RawAEADKey);
      const encryptedVaultKey = base64ToUint8Array(memberSlot.memberVaultKeyWrapped);
      const aeadMasterKeyRaw = await AEAD.decrypt(sharedKey, encryptedVaultKey);
      this.#aeadVaultKey = await AEAD.importAEADKey(aeadMasterKeyRaw as RawAEADKey);
      if (IS_MANAGER_ROLE(memberSlot.memberRole)) {
        // decrypt member list area if manager
        const managersKey = await getManagerKey(aeadMasterKeyRaw as Uint8Array);
        this.#managersArea = {
          key: managersKey,
          memberList: await decryptMemberList(this.#vaultManifest.payload.managerOnlyMemberList, managersKey),
        };
        this.#isManagerMember = true;
        this.#featuresKey = await getFeaturesKey(aeadMasterKeyRaw as Uint8Array);
      } else {
        this.#isManagerMember = false;
        this.#featuresKey = this.#aeadVaultKey;
      }
      if (this.#vaultManifest.payload.featuresEncrypted && this.#vaultManifest.payload.featuresEncrypted.length > 0) {
        const featuresDecrypted = await AEAD.decrypt(
          this.#featuresKey!,
          base64ToUint8Array(this.#vaultManifest.payload.featuresEncrypted),
        );
        const featuresJson = fromUint8Array(featuresDecrypted);
        for (const feature of JSON.parse(featuresJson) as Feature[]) {
          this.#features.push(new FeatureController(feature));
        }
      }
      this.#activeMember = member;
      aeadMasterKeyRaw.fill(0);
      sharedKeyRaw.fill(0);
      this.#vaultUnlocked = true;
      return true;
    }
    this.#vaultUnlocked = false;
    return false;
  }

  // addTasker(tasker: any) {
  //   this.#tasker = tasker;
  // }

  // TODO get rid of it later
  getAll() {
    return {
      etag: this.#etag,
      vault: this.#vaultManifest,
      vaultKey: this.#aeadVaultKey,
      vaultUnlocked: this.#vaultUnlocked,
      isManagerMember: this.#isManagerMember,
      activeMember: this.#activeMember,
      managersArea: this.#managersArea,
      // tasker: this.#tasker,
    };
  }

  isLocked() {
    return !this.#vaultUnlocked;
  }

  updateAuthToken(newToken: string) {
    this.#authToken = newToken;
  }

  // getAuthToken() {
  //   return this.#authToken;
  // }

  getVaultCredentials() {
    if (this.isLocked() || !this.#activeMember) {
      throw new Error('Vault is locked');
    }
    return {
      vaultId: this.#vaultManifest.payload.id,
      memberId: this.#activeMember.memberId,
      authToken: this.#authToken || '',
      vault: {
        id: this.#vaultManifest.payload.id,
        etag: this.#etag,
      },
    };
  }

  listFeatures(type?: string): FeatureController[] {
    if (!this.#vaultUnlocked) {
      throw new Error('Vault is locked');
    }
    if (type) {
      return this.#features.filter(feature => feature.feature.featureType === type);
    }
    return this.#features;
  }

  getFeatureById(featureId: string): FeatureController | null {
    if (!this.#vaultUnlocked) {
      throw new Error('Vault is locked');
    }
    for (const feature of this.#features) {
      if (feature.feature.featureId === featureId) {
        return feature;
      }
    }
    return null;
  }

  getFeatureByName(name: string): FeatureController | null {
    if (!this.#vaultUnlocked) {
      throw new Error('Vault is locked');
    }
    for (const feature of this.#features) {
      if (feature.feature.featureName === name) {
        return feature;
      }
    }
    return null;
  }

  timeToUpdate = () => {
    console.warn('TIME TO UPDATE VAULT DATA');
  };
}
