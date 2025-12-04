import { CryptoUtils } from './CryptoUtils';
// import type { LoginRequest } from './ApiClient';
import type { MemberSlot, Vault } from './Vault.js';
import { CryptoPQ, ML_DSA_PUBLIC_KEY_SIZE, ML_DSA_SIGNATURE_SIZE } from './CryptoPQ';
import { base64ToUint8Array, generateCanonicalJSON } from './Helpers';
import { VALIDATION_RULES as C, RESERVED_USERNAMES, ROLE, VAULT_TYPE } from './Consts';
// import { sign } from 'crypto';

// const _isValidOtherPublicUserData = (data: Record<string, string>[]): boolean => {
//   if (!Array.isArray(data)) return false;
//   return data.every(item => typeof item === 'object' && item !== null && 'key' in item && 'value' in item);
// };

// const _isTimestampValid = (clientTime: number): boolean => {
//   const serverTime = Date.now();
//   const timeDiff = Math.abs(serverTime - clientTime);
//   if (timeDiff > TIMESTAMP_TOLERANCE_MS) {
//     return false;
//   }
//   return true;
// };

// const _isValidSignedHeaders = (headers: Headers): boolean => {
//   const [signerId, clientTime, requestId, contentSha256, signatureHeader] = _getPredefinedHeaderValues(headers);
//   if (!signerId || clientTime === 0 || !requestId || !contentSha256 || !signatureHeader) {
//     throw new Error('Missing required signed headers');
//   }
//   const isValidTimestamp = _isTimestampValid(clientTime);
//   if (!isValidTimestamp) {
//     throw new Error('Invalid timestamp');
//   }
//   return true;
// };
const _validateFields = (body: any, requiredFields: readonly string[]): boolean => {
  for (const field of requiredFields) {
    if (!(field in body)) {
      console.warn(`Missing required field: ${field}`);
      return false;
    }
  }
  return true;
};

const _isValidRegistrationPayload = (body: Vault): boolean => {
  if (
    _validateFields(body, C.vaultRegistrationBody.requiredFields) &&
    _validateFields(body.payload, C.vaultRegistrationPayload.requiredFields) &&
    _validateAccountId(body.payload.id) &&
    _validateVaultName(body.payload.name) &&
    body.payload.type === VAULT_TYPE.personal &&
    _validateVaultMemberSlots(body.payload.memberSlots)
  ) {
    if (body.payload.email && !validateEmail(body.payload.email)) return false;
    return true;
  }
  return false;
};

const _isMatchingManagerSigner = (body: Vault): boolean => {
  const signerId = body.signerId;
  const members = body.payload.memberSlots || ([] as MemberSlot[]);
  const member = _getMemberFromMemberSlots(members, signerId as string);
  if (!member) return false;
  return member.memberRole === ROLE.OWNER || member.memberRole === ROLE.ADMIN;
};

// const _getPredefinedHeaderValues = (headers: Headers): [string, number, string, string, string] => {
//   return [
//     headers.get('X-Signer-ID') || '',
//     parseInt(headers.get('X-Timestamp') || '0', 10),
//     headers.get('X-Request-ID') || '',
//     headers.get('Content-SHA256') || '',
//     headers.get('X-Signature') || '',
//   ];
// };

export const isValidSignature = (body: Vault): boolean => {
  const signerId = body.signerId;
  const payloadHash = body.payloadHash;
  const signature = body.signature;
  if ([signerId, payloadHash, signature].some(v => !v?.trim())) {
    throw new Error('Missing or malformed signature components');
  }
  const signatureBytes = base64ToUint8Array(signature as string);
  if (signatureBytes.length !== ML_DSA_SIGNATURE_SIZE) {
    throw new Error('Invalid signature length');
  }
  const member = _getMemberFromMemberSlots(body.payload.memberSlots, signerId as string);
  if (!member) {
    throw new Error('Signer not found in member slots');
  }
  const memberPublicKey = base64ToUint8Array(member.memberDsaPubkey);
  if (memberPublicKey.length !== ML_DSA_PUBLIC_KEY_SIZE) {
    throw new Error('Invalid member public key length');
  }
  const hashUint8 = base64ToUint8Array(payloadHash as string);
  return CryptoPQ.verifySignature(memberPublicKey, hashUint8, signatureBytes);
};

const _isAccountNameReserved = (accountName: string): boolean => {
  const normalized = accountName.toLowerCase().trim();

  // Direct match
  if (RESERVED_USERNAMES.includes(normalized)) return true;

  // Starts with reserved terms
  const reservedPrefixes = ['admin', 'mod', 'support', 'staff', 'system', 'official'];
  if (reservedPrefixes.some(prefix => normalized.startsWith(prefix))) return true;

  // Contains "official" or "verified" anywhere
  if (/(official|verified|staff|support|admin)/i.test(normalized)) return true;

  return false;
};

export const validateAccountName = (accountName: string): boolean => {
  if (typeof accountName !== 'string') return false;
  if (_isAccountNameReserved(accountName)) return false;
  const rules = C.accountName;
  return (
    accountName.length >= rules.minLength && accountName.length <= rules.maxLength && rules.pattern.test(accountName)
  );
};

export const _validateVaultName = (vaultName: string): boolean => {
  if (typeof vaultName !== 'string') return false;
  const trimmed = vaultName.trim();
  const rules = C.vaultName;
  return trimmed.length >= rules.minLength && trimmed.length <= rules.maxLength && rules.pattern.test(trimmed);
};

export const validateEmail = (email: string): boolean => {
  if (typeof email !== 'string') return false;
  const rules = C.email;
  return email.length >= rules.minLength && email.length <= rules.maxLength && rules.pattern.test(email);
};

const _validateAccountId = (accountId: string): boolean => {
  return typeof accountId === 'string' && C.accountId.pattern.test(accountId);
};

const _validateVaultMemberSlots = (memberSlots: MemberSlot[]): boolean => {
  const rules = C.vaultMemberSlots;
  if (!Array.isArray(memberSlots) || memberSlots.length < rules.minCount) return false;
  return memberSlots.every(
    env =>
      env &&
      typeof env === 'object' &&
      rules.requiredFields.every(
        field => (field in env && typeof env[field] === 'string') || typeof env[field] === 'number',
      ),
  );
};

const _getMemberFromMemberSlots = (memberSlots: MemberSlot[], memberId: string): MemberSlot | null => {
  for (const member of memberSlots) {
    if (member.memberId === memberId) {
      return member;
    }
  }
  return null;
};

// const _isValidLoginPayload = (body: LoginRequest): boolean => {
//   for (const field of C.deviceLoginPayload.requiredFields) {
//     if (!(field in body)) {
//       return false;
//     }
//   }
//   if (!validateUsername(body.username)) return false;
//   if (!_validateAccountId(body.deviceId)) return false;
//   return true;
// };
export const validateRegistrationRequest = async (body: Vault): Promise<boolean> => {
  if (!_isValidRegistrationPayload(body) || !_isMatchingManagerSigner(body)) {
    return false;
  }
  const calculatedSha256 = await CryptoUtils.sha256(generateCanonicalJSON(body.payload), 'base64');
  const contentSha256 = body.payloadHash;
  if (calculatedSha256 === contentSha256) {
    const isValid = isValidSignature(body);
    if (!isValid) {
      throw new Error('Invalid signature');
    }
    return true;
  }
  return false;
};

// export const validateLoginRequest = async (headers: Headers, body: LoginRequest): Promise<boolean> => {
//   const validHeaders = _isValidSignedHeaders(headers);
//   if (!validHeaders) {
//     throw new Error('Invalid headers for login');
//   }
//   const validPayload = _isValidLoginPayload(body);
//   if (!validPayload) {
//     throw new Error('Invalid login payload');
//   }
//   const payloadString = generateCanonicalJSON(body);
//   const calculatedSha256 = await CryptoUtils.sha256(payloadString, 'hex');
//   const contentSha256 = headers.get('Content-SHA256');
//   if (calculatedSha256 !== contentSha256) {
//     throw new Error('Content SHA256 mismatch');
//   }
//   return true;
// };
