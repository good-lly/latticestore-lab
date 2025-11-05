export const RESERVED_USERNAMES = [
  // System & Admin
  'admin',
  'administrator',
  'root',
  'system',
  'sysadmin',
  'moderator',
  'mod',
  'superuser',
  'operator',
  'webmaster',

  // Official/Support
  'support',
  'help',
  'helpdesk',
  'service',
  'customer-service',
  'staff',
  'team',
  'official',
  'verified',
  'info',
  'contact',

  // Security-sensitive
  'security',
  'abuse',
  'noreply',
  'no-reply',
  'postmaster',
  'hostmaster',
  'privacy',
  'legal',
  'dmca',
  'copyright',

  // Platform features
  'api',
  'www',
  'mail',
  'ftp',
  'smtp',
  'pop',
  'imap',
  'login',
  'logout',
  'register',
  'signup',
  'signin',
  'auth',
  'oauth',
  'settings',
  'account',
  'profile',
  'dashboard',
  'home',
  'search',
  'discover',

  // Deceptive/Confusing
  'everyone',
  'all',
  'none',
  'null',
  'undefined',
  'anonymous',
  'guest',
  'user',
  'test',
  'demo',
  'example',
  'sample',

  // Your app name variants
  'latticestore',
  'lattice-store',
  'lattice',
  'latticeapp',

  // Common scam patterns
  'notification',
  'notifications',
  'alert',
  'alerts',
  'message',
  'messages',
  'payment',
  'billing',
  'invoice',
  'receipt',
];
export const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
export const TOKEN_EXPIRATION_SECONDS = 1000 * 60 * 30; // 30 minutes

export const KEM_KEY_LENGTH_BYTES = 64;
export const DSA_KEY_LENGTH_BYTES = 32;
export const TOKEN_LENGTH_BYTES = 64;

export const CUSTOM_KEM_STRING = '*incredibly_unique-custom_string_for_KEM&LatticeStore*';
export const CUSTOM_DSA_STRING = '*incredibly_unique-custom_string_for_ML-DSA&LatticeStore*';

export const VALIDATION_RULES = {
  username: {
    minLength: 5,
    maxLength: 256,
    pattern: /^[a-zA-Z0-9_-]+$/,
    description: 'Alphanumeric, underscore, and hyphen only',
  },
  email: {
    minLength: 5,
    maxLength: 256,
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    description: 'Standard email format',
  },
  displayName: {
    minLength: 3,
    maxLength: 64,
    pattern: /^[\p{L}\p{N}\p{P}\p{Z}]+$/u,
    description: 'Display name in any language',
  },
  deviceName: {
    minLength: 3,
    maxLength: 128,
    pattern: /^[\x20-\x7E]+$/,
    description: 'Printable ASCII characters',
  },
  accountId: {
    exactLength: 64,
    pattern: /^[a-f0-9]{64}$/,
    description: '64 hex characters (lowercase)',
  },
  deviceRegistrationEnvelopes: {
    minCount: 2,
    requiredFields: ['deviceId', 'dsaPublicKeyBase64', 'encryptedMasterKeyHex', 'cipherTextHex'],
  },
  signedHeaders: {
    requiredFields: ['Content-SHA256', 'X-Timestamp', 'X-Request-ID', 'X-Signature'],
  },
  deviceRegistrationPayload: {
    requiredFields: ['devicePublicKey', 'deviceEnvelopes', 'deviceListFile', 'devices', 'username'],
  },
  deviceLoginPayload: {
    requiredFields: ['username', 'deviceId'],
  },
} as const;
