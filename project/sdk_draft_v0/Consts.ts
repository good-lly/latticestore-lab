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

export const VALIDATION_RULES = {
  username: {
    minLength: 3,
    maxLength: 64,
    pattern: /^[a-zA-Z0-9_-]+$/,
    description: 'Alphanumeric, underscore, and hyphen only',
  },
  displayName: {
    minLength: 3,
    maxLength: 64,
    pattern: /^[\p{L}\p{N}\p{P}\p{Z}]+$/u,
    description: 'Display name in any language',
  },
  deviceName: {
    minLength: 3,
    maxLength: 64,
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
    requiredFields: ['deviceId', 'kemPublicKeyHex', 'encryptedMasterKeyHex', 'cipherTextHex'],
  },
  deviceRegistrationHeaders: {
    requiredFields: ['Content-SHA256', 'X-Timestamp', 'X-Request-ID', 'X-Signature'],
  },
  deviceRegistrationPayload: {
    requiredFields: ['accountId', 'username', 'deviceName', 'devicePublicKey', 'deviceEnvelopes', 'cipherRootFile'],
  },
} as const;
