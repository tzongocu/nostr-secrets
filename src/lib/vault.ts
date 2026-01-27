/**
 * Encrypted Vault – AES-256-GCM + PBKDF2
 * Stores all wallet data encrypted with the user PIN.
 * PIN is optional - when disabled, data is stored unencrypted.
 */

import type { NostrKey, SignLog } from './keyStore';

export interface VaultData {
  keys: NostrKey[];
  logs: SignLog[];
  defaultKeyId?: string;
  deletedSecretIds?: string[];
  lastDecrypted?: Record<string, number>; // eventId -> timestamp
}

export interface VaultSettings {
  pinEnabled: boolean;
}

// New storage keys (prevents format-mismatch "data loss")
const ENCRYPTED_STORAGE_KEY = 'nostr-vault-encrypted';
const PLAIN_STORAGE_KEY = 'nostr-vault-plain';

// Legacy key used by older versions (could contain either JSON or encrypted payload)
const LEGACY_STORAGE_KEY = 'nostr-vault';

// Legacy salt key - now salt is embedded in encrypted payload
const LEGACY_SALT_KEY = 'nostr-vault-salt';
const SETTINGS_KEY = 'nostr-vault-settings';

// Payload format version for future compatibility
const PAYLOAD_VERSION = 2; // v2 = salt embedded in payload
const ITERATIONS = 100_000;

// ---------- Helpers ----------

const getRandomBytes = (len: number): Uint8Array => crypto.getRandomValues(new Uint8Array(len));

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);
const decode = (buf: Uint8Array): string => new TextDecoder().decode(buf);

const toBase64 = (buf: Uint8Array): string => btoa(String.fromCharCode(...buf));
const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const isProbablyJson = (value: string): boolean => {
  const t = value.trim();
  return t.startsWith('{') || t.startsWith('[');
};

const saveVaultSettings = (settings: VaultSettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

const migrateLegacyStorageIfNeeded = (): void => {
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacy) return;

  // Legacy could be either JSON (unencrypted) or base64 (encrypted)
  if (isProbablyJson(legacy)) {
    if (!localStorage.getItem(PLAIN_STORAGE_KEY)) {
      localStorage.setItem(PLAIN_STORAGE_KEY, legacy);
    }
    saveVaultSettings({ pinEnabled: false });
  } else {
    if (!localStorage.getItem(ENCRYPTED_STORAGE_KEY)) {
      localStorage.setItem(ENCRYPTED_STORAGE_KEY, legacy);
    }
    saveVaultSettings({ pinEnabled: true });
  }

  localStorage.removeItem(LEGACY_STORAGE_KEY);
};

// ---------- Settings ----------

export const getVaultSettings = (): VaultSettings => {
  migrateLegacyStorageIfNeeded();

  const hasEncrypted = !!localStorage.getItem(ENCRYPTED_STORAGE_KEY);
  const hasPlain = !!localStorage.getItem(PLAIN_STORAGE_KEY);

  const stored = localStorage.getItem(SETTINGS_KEY);
  const base: VaultSettings = stored ? JSON.parse(stored) : { pinEnabled: false };

  // Self-heal: prefer the storage that actually exists
  if (hasEncrypted && !hasPlain) {
    if (!base.pinEnabled) saveVaultSettings({ pinEnabled: true });
    return { pinEnabled: true };
  }
  if (!hasEncrypted && hasPlain) {
    if (base.pinEnabled) saveVaultSettings({ pinEnabled: false });
    return { pinEnabled: false };
  }

  // If both exist (shouldn't happen), prefer encrypted unless user explicitly disabled PIN
  if (hasEncrypted && hasPlain && !stored) {
    saveVaultSettings({ pinEnabled: true });
    return { pinEnabled: true };
  }

  return base;
};

// ---------- Key derivation ----------

const deriveKey = async (pin: string, salt: Uint8Array): Promise<CryptoKey> => {
  const pinBytes = encode(pin);
  const baseKey = await crypto.subtle.importKey('raw', pinBytes.buffer as ArrayBuffer, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

// ---------- Encrypt / Decrypt ----------
// Payload format v2: version (1 byte) + salt (16 bytes) + iv (12 bytes) + ciphertext

const encrypt = async (data: VaultData, pin: string): Promise<string> => {
  const salt = getRandomBytes(16); // Fresh salt for each encryption
  const iv = getRandomBytes(12);
  const key = await deriveKey(pin, salt);
  const plain = encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, plain.buffer as ArrayBuffer);
  
  // Combine: version + salt + iv + cipher
  const combined = new Uint8Array(1 + salt.length + iv.length + cipher.byteLength);
  combined[0] = PAYLOAD_VERSION;
  combined.set(salt, 1);
  combined.set(iv, 1 + salt.length);
  combined.set(new Uint8Array(cipher), 1 + salt.length + iv.length);
  return toBase64(combined);
};

const decrypt = async (payload: string, pin: string): Promise<VaultData> => {
  const combined = fromBase64(payload);
  
  let salt: Uint8Array;
  let iv: Uint8Array;
  let cipher: Uint8Array;
  
  // Check version byte to determine format
  if (combined[0] === PAYLOAD_VERSION) {
    // v2 format: version (1) + salt (16) + iv (12) + ciphertext
    salt = combined.slice(1, 17);
    iv = combined.slice(17, 29);
    cipher = combined.slice(29);
  } else {
    // Legacy v1 format: iv (12) + ciphertext, salt stored separately
    const legacySalt = localStorage.getItem(LEGACY_SALT_KEY);
    if (!legacySalt) throw new Error('Legacy salt not found');
    salt = fromBase64(legacySalt);
    iv = combined.slice(0, 12);
    cipher = combined.slice(12);
  }
  
  const key = await deriveKey(pin, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, cipher.buffer as ArrayBuffer);
  const json = decode(new Uint8Array(plain));
  const parsed = JSON.parse(json);
  // Rehydrate dates - secrets are no longer stored locally
  return {
    keys: (parsed.keys ?? []).map((k: any) => ({ ...k, createdAt: new Date(k.createdAt) })),
    logs: (parsed.logs ?? []).map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })),
    defaultKeyId: parsed.defaultKeyId,
    deletedSecretIds: parsed.deletedSecretIds ?? [],
    lastDecrypted: parsed.lastDecrypted ?? {},
  };
};

// ---------- Unencrypted storage (when PIN disabled) ----------

const parseRawData = (json: string): VaultData => {
  const parsed = JSON.parse(json);
  // Secrets are no longer stored locally - they come from relays
  return {
    keys: (parsed.keys ?? []).map((k: any) => ({ ...k, createdAt: new Date(k.createdAt) })),
    logs: (parsed.logs ?? []).map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })),
    defaultKeyId: parsed.defaultKeyId,
    deletedSecretIds: parsed.deletedSecretIds ?? [],
    lastDecrypted: parsed.lastDecrypted ?? {},
  };
};

export const loadUnencryptedVault = (): VaultData => {
  migrateLegacyStorageIfNeeded();

  const stored = localStorage.getItem(PLAIN_STORAGE_KEY);
  if (!stored) return { keys: [], logs: [] };
  try {
    return parseRawData(stored);
  } catch {
    return { keys: [], logs: [] };
  }
};

export const saveUnencryptedVault = (data: VaultData): void => {
  localStorage.setItem(PLAIN_STORAGE_KEY, JSON.stringify(data));
  saveVaultSettings({ pinEnabled: false });
};

// ---------- Public API ----------

export const vaultExists = (): boolean => {
  migrateLegacyStorageIfNeeded();
  return !!localStorage.getItem(ENCRYPTED_STORAGE_KEY);
};

export const createVault = async (pin: string): Promise<void> => {
  migrateLegacyStorageIfNeeded();

  const empty: VaultData = { keys: [], logs: [] };
  const payload = await encrypt(empty, pin);

  localStorage.setItem(ENCRYPTED_STORAGE_KEY, payload);
  localStorage.removeItem(PLAIN_STORAGE_KEY);
  localStorage.removeItem(LEGACY_SALT_KEY); // Clean up legacy salt
  saveVaultSettings({ pinEnabled: true });
};

export const unlockVault = async (pin: string): Promise<VaultData> => {
  migrateLegacyStorageIfNeeded();

  const payload = localStorage.getItem(ENCRYPTED_STORAGE_KEY);
  if (!payload) throw new Error('Vault not found');
  return decrypt(payload, pin); // Will throw if wrong PIN
};

export const saveVault = async (pin: string, data: VaultData): Promise<void> => {
  migrateLegacyStorageIfNeeded();

  const payload = await encrypt(data, pin);
  localStorage.setItem(ENCRYPTED_STORAGE_KEY, payload);
  // After successful re-encryption with new salt, remove legacy salt
  localStorage.removeItem(LEGACY_SALT_KEY);
};

export const deleteVault = (): void => {
  migrateLegacyStorageIfNeeded();

  localStorage.removeItem(ENCRYPTED_STORAGE_KEY);
  localStorage.removeItem(PLAIN_STORAGE_KEY);
  localStorage.removeItem(LEGACY_SALT_KEY);
  saveVaultSettings({ pinEnabled: false });
};

export const disablePin = (currentData: VaultData): void => {
  migrateLegacyStorageIfNeeded();

  // Convert encrypted vault to unencrypted
  localStorage.setItem(PLAIN_STORAGE_KEY, JSON.stringify(currentData));
  localStorage.removeItem(ENCRYPTED_STORAGE_KEY);
  localStorage.removeItem(LEGACY_SALT_KEY);
  saveVaultSettings({ pinEnabled: false });
};

export const enablePinWithData = async (pin: string, data: VaultData): Promise<void> => {
  migrateLegacyStorageIfNeeded();

  const payload = await encrypt(data, pin);
  localStorage.setItem(ENCRYPTED_STORAGE_KEY, payload);
  localStorage.removeItem(PLAIN_STORAGE_KEY);
  localStorage.removeItem(LEGACY_SALT_KEY);
  saveVaultSettings({ pinEnabled: true });
};
