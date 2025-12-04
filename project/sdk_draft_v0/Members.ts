import { CryptoPQ } from './CryptoPQ';
import { CryptoUtils } from './CryptoUtils';
import { AEAD, RawAEADKey } from './CryptoAEAD';
import { uint8ArrayToBase64, now } from './Helpers';

import { MEMBER_STATUS } from './Consts.js';
import type { MemberRole, MemberId, Base64, Base64Encrypted, Timestamp } from './Consts.js';

import type { MemberSlot, MemberEncryptedDetail, MemberSecrets } from './Vault.js';

export type MemberCredentials = {
  memberEncryptedDetail: MemberEncryptedDetail;
  memberSlot: MemberSlot;
  __secrets: MemberSecrets;
};

export class Members {
  public static async createNewCredentials(
    name: string,
    role: MemberRole,
    rootKey: Uint8Array,
    initSeed: Uint8Array,
  ): Promise<MemberCredentials> {
    // Implementation goes here
    const { kemSeed, dsaSeed } = CryptoUtils.deriveSeeds(initSeed);

    const kemKeys = CryptoPQ.generateKemKeys(kemSeed);
    const { cipherText, sharedSecret } = CryptoPQ.encapsulate(kemKeys.publicKey);
    const aeadSharedKey = await AEAD.importAEADKey(sharedSecret as RawAEADKey);
    sharedSecret.fill(0); // Clear shared secret from memory

    const encryptedMasterKey = await AEAD.encrypt(
      aeadSharedKey,
      CryptoUtils.deriveKeyForRole(role, rootKey) as Uint8Array<ArrayBuffer>,
    );

    const dsaKeys = CryptoPQ.generateDsaKeys(dsaSeed);

    const memberId = CryptoUtils.computeMemberId(dsaKeys.publicKey) as MemberId;
    const timestamp = now() as Timestamp;

    // we return object with two parts: private (MemberEncryptedDetail) and public (MemberSlot) + credentials
    return {
      memberEncryptedDetail: {
        memberId,
        memberName: name,
        memberKemPubkey: uint8ArrayToBase64(kemKeys.publicKey) as Base64<Uint8Array>,
        memberAddedBy: memberId,
        memberAddedAt: timestamp,
      },
      memberSlot: {
        memberId,
        memberRole: role,
        memberStatus: MEMBER_STATUS.ACTIVE,
        memberKemCiphertext: uint8ArrayToBase64(cipherText) as Base64<Uint8Array>,
        memberVaultKeyWrapped: uint8ArrayToBase64(encryptedMasterKey) as Base64<Uint8Array>,
        memberDsaPubkey: uint8ArrayToBase64(dsaKeys.publicKey) as Base64<Uint8Array>,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      __secrets: {
        memberId,
        kemSecretKey: kemKeys.secretKey,
        dsaSecretKey: dsaKeys.secretKey,
      },
    };
  }

  public static async encryptMemberList(
    memberDetails: MemberEncryptedDetail[],
    aeadKey: CryptoKey,
  ): Promise<Base64Encrypted<MemberEncryptedDetail[]>> {
    const serialized = new TextEncoder().encode(JSON.stringify(memberDetails));
    const encrypted = await AEAD.encrypt(aeadKey, serialized);
    return uint8ArrayToBase64(encrypted) as Base64Encrypted<MemberEncryptedDetail[]>;
  }
}
