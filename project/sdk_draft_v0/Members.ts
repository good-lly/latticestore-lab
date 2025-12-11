import { CryptoPQ } from './CryptoPQ';
import { deriveSeeds, deriveKeyForRole, getMemberIdFromPubkey } from './CryptoUtils';
import { AEAD, RawAEADKey } from './CryptoAEAD';
import { uint8ArrayToBase64, now, toUint8Array } from './Helpers';
import { MEMBER_STATUS } from './Consts.js';

import type { MemberRole, MemberId, Base64, Base64Encrypted, Timestamp } from './Consts.js';
import type { MemberSlot, MemberEncryptedDetail, MemberSecrets } from './Vault.js';

export type MemberCredentials = {
  memberEncryptedDetail: MemberEncryptedDetail;
  memberSlot: MemberSlot;
  __secrets: MemberSecrets;
};

export const createNewCredentials = async (
  name: string,
  role: MemberRole,
  rootKey: Uint8Array,
  initSeed: Uint8Array,
): Promise<MemberCredentials> => {
  const { kemSeed, dsaSeed } = deriveSeeds(initSeed);

  const kemKeys = CryptoPQ.generateKemKeys(kemSeed);
  const { cipherText, sharedSecret } = CryptoPQ.encapsulate(kemKeys.publicKey);
  const aeadSharedKey = await AEAD.importAEADKey(sharedSecret as RawAEADKey);
  sharedSecret.fill(0); // Clear shared secret from memory

  const encryptedMasterKey = await AEAD.encrypt(
    aeadSharedKey,
    deriveKeyForRole(role, rootKey) as Uint8Array<ArrayBuffer>,
  );

  const dsaKeys = CryptoPQ.generateDsaKeys(dsaSeed);

  const memberId = getMemberIdFromPubkey(dsaKeys.publicKey) as MemberId;
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
};

export const encryptMemberList = async (
  memberDetails: MemberEncryptedDetail[],
  aeadKey: CryptoKey,
): Promise<Base64Encrypted<MemberEncryptedDetail[]>> => {
  const serialized = toUint8Array(JSON.stringify(memberDetails));
  const encrypted = await AEAD.encrypt(aeadKey, serialized as Uint8Array<ArrayBuffer>);
  return uint8ArrayToBase64(encrypted) as Base64Encrypted<MemberEncryptedDetail[]>;
};

export const buildMember = async (seed: Uint8Array) => {
  const { kemSeed, dsaSeed } = deriveSeeds(seed);
  const kemKeys = CryptoPQ.generateKemKeys(kemSeed);
  const dsaKeys = CryptoPQ.generateDsaKeys(dsaSeed);
  const memberId = getMemberIdFromPubkey(dsaKeys.publicKey) as MemberId;
  return {
    memberId,
    kemSecretKey: kemKeys.secretKey,
    dsaSecretKey: dsaKeys.secretKey,
  } as MemberSecrets;
};
