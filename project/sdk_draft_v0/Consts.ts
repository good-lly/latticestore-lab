export const REQUIRED_REGISTER_HEADERS = ['Content-SHA256', 'X-Timestamp', 'X-Request-ID', 'X-Signature'];
export const REQUIRED_REGISTER_PAYLOAD_FIELDS = [
  'accountId',
  'username',
  'deviceName',
  'devicePublicKey',
  'deviceEnvelopes',
  'cipherRootFile',
];
export const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
