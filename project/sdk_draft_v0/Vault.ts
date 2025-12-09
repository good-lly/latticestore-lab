import type {
  VaultId,
  VaultType,
  MemberId,
  MemberRole,
  MemberStatus,
  Base64,
  Timestamp,
  Base64Encrypted,
} from './Consts.js';
import type { Feature } from './features/Features';

export type MemberSlot = {
  memberId: MemberId;
  memberRole: MemberRole;
  memberStatus: MemberStatus;
  memberKemCiphertext: Base64<Uint8Array>;
  memberVaultKeyWrapped: Base64<Uint8Array>; // appropriate vault key wrapped for this member on role
  memberDsaPubkey: Base64<Uint8Array>; // ML-DSA public key
  createdAt: Timestamp;
  updatedAt: Timestamp;
  memberPublicNote?: string;
};

export type MemberEncryptedDetail = {
  memberId: MemberId;
  memberName: string;
  memberKemPubkey: Base64<Uint8Array>; // for re-keying (managers only)
  memberAddedBy: MemberId;
  memberAddedAt: Timestamp;
  memberPrivateNote?: string;
};

export type MemberSecrets = {
  memberId: MemberId;
  kemSecretKey: Uint8Array;
  dsaSecretKey: Uint8Array;
};

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
