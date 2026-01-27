/**
 * NIP-44 v2 Encryption/Decryption
 * Uses ChaCha20 + HMAC-SHA256 for AEAD encryption
 * More secure than NIP-04 (AES-256-CBC without MAC)
 */

import { nip44 } from 'nostr-tools';
import { bech32 } from '@scure/base';

const BECH32_LIMIT = 1500;

// Decode bech32 key to bytes
const decodeBech32 = (encoded: string): Uint8Array => {
  const decoded = bech32.decode(encoded as `${string}1${string}`, BECH32_LIMIT);
  return new Uint8Array(bech32.fromWords(decoded.words));
};

// Convert bytes to hex
const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Convert nsec (bech32) to hex private key
 */
export const nsecToHex = (nsec: string): string => {
  const bytes = decodeBech32(nsec);
  return bytesToHex(bytes);
};

/**
 * Convert npub (bech32) to hex public key
 */
export const npubToHex = (npub: string): string => {
  const bytes = decodeBech32(npub);
  return bytesToHex(bytes);
};

/**
 * Get NIP-44 conversation key from private key and public key
 * Uses ECDH + HKDF for secure key derivation
 */
export const getConversationKey = (privateKeyHex: string, publicKeyHex: string): Uint8Array => {
  const privBytes = hexToBytes(privateKeyHex);
  return nip44.v2.utils.getConversationKey(privBytes, publicKeyHex);
};

/**
 * Encrypt content using NIP-44 v2
 * Returns base64-encoded ciphertext with version byte, nonce, and MAC
 */
export const encryptNIP44 = (content: string, conversationKey: Uint8Array): string => {
  return nip44.v2.encrypt(content, conversationKey);
};

/**
 * Decrypt content using NIP-44 v2
 * Verifies HMAC before decryption (AEAD)
 */
export const decryptNIP44 = (ciphertext: string, conversationKey: Uint8Array): string => {
  return nip44.v2.decrypt(ciphertext, conversationKey);
};

/**
 * Detect encryption version from ciphertext format
 * - NIP-04: Contains "?iv=" separator
 * - NIP-44: Base64 starting with version byte (0x02 -> "Ag" in base64)
 */
export const detectEncryptionVersion = (ciphertext: string): 1 | 2 => {
  if (ciphertext.includes('?iv=')) {
    return 1; // NIP-04
  }
  // NIP-44 v2 ciphertext starts with version byte 0x02
  // In base64, 0x02 followed by any byte will start with 'A'
  if (ciphertext.startsWith('A')) {
    return 2; // NIP-44
  }
  // Default to NIP-04 for backwards compatibility
  return 1;
};

// Helper to convert hex string to bytes
const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};
