/**
 * Vault Integrity - Checksums and self-healing for vault data
 * Detects data corruption and automatically repairs inconsistencies
 */

import type { VaultData } from './vault';
import type { NostrKey, SignLog } from './keyStore';

const CHECKSUM_KEY = 'nostr-vault-checksum';

export interface IntegrityReport {
  isValid: boolean;
  checksumMatch: boolean;
  issues: string[];
  repaired: string[];
}

/**
 * Generate SHA-256 checksum for vault data
 */
export const generateChecksum = async (data: VaultData): Promise<string> => {
  // Serialize data deterministically (sort keys for consistency)
  const serialized = JSON.stringify({
    keys: data.keys.map(k => ({
      id: k.id,
      name: k.name,
      publicKey: k.publicKey,
      // Don't include privateKey in checksum for security
    })).sort((a, b) => a.id.localeCompare(b.id)),
    logsCount: data.logs.length,
    defaultKeyId: data.defaultKeyId || null,
    deletedSecretIds: [...(data.deletedSecretIds || [])].sort(),
  });
  
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(serialized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Save checksum to localStorage
 */
export const saveChecksum = (checksum: string): void => {
  localStorage.setItem(CHECKSUM_KEY, checksum);
};

/**
 * Get stored checksum
 */
export const getStoredChecksum = (): string | null => {
  return localStorage.getItem(CHECKSUM_KEY);
};

/**
 * Validate a single key for integrity
 */
const validateKey = (key: any, index: number): { valid: boolean; issues: string[] } => {
  const issues: string[] = [];
  
  if (!key.id || typeof key.id !== 'string') {
    issues.push(`Key ${index}: missing or invalid id`);
  }
  if (!key.name || typeof key.name !== 'string') {
    issues.push(`Key ${index}: missing or invalid name`);
  }
  if (!key.publicKey || typeof key.publicKey !== 'string') {
    issues.push(`Key ${index}: missing or invalid publicKey`);
  }
  if (!key.privateKey || typeof key.privateKey !== 'string') {
    issues.push(`Key ${index}: missing or invalid privateKey`);
  }
  if (key.publicKey && !key.publicKey.startsWith('npub1')) {
    issues.push(`Key ${index}: publicKey doesn't start with npub1`);
  }
  if (key.privateKey && !key.privateKey.startsWith('nsec1')) {
    issues.push(`Key ${index}: privateKey doesn't start with nsec1`);
  }
  
  return { valid: issues.length === 0, issues };
};

/**
 * Validate a single log entry
 */
const validateLog = (log: any, index: number): { valid: boolean; issues: string[] } => {
  const issues: string[] = [];
  
  if (!log.id || typeof log.id !== 'string') {
    issues.push(`Log ${index}: missing or invalid id`);
  }
  if (!log.keyId || typeof log.keyId !== 'string') {
    issues.push(`Log ${index}: missing or invalid keyId`);
  }
  if (!log.timestamp) {
    issues.push(`Log ${index}: missing timestamp`);
  }
  
  return { valid: issues.length === 0, issues };
};

/**
 * Self-heal vault data by fixing/removing corrupted entries
 */
export const selfHealVault = (data: VaultData): { healed: VaultData; repairs: string[] } => {
  const repairs: string[] = [];
  
  // Heal keys - remove invalid ones
  const validKeys: NostrKey[] = [];
  const seenKeyIds = new Set<string>();
  
  for (const key of data.keys || []) {
    // Skip duplicates
    if (key.id && seenKeyIds.has(key.id)) {
      repairs.push(`Removed duplicate key: ${key.name || key.id}`);
      continue;
    }
    
    const validation = validateKey(key, validKeys.length);
    if (validation.valid) {
      validKeys.push(key);
      seenKeyIds.add(key.id);
    } else {
      repairs.push(`Removed corrupted key: ${key.name || 'unknown'} (${validation.issues.join(', ')})`);
    }
  }
  
  // Heal logs - remove invalid ones and orphaned (referencing deleted keys)
  const validLogs: SignLog[] = [];
  const keyIds = new Set(validKeys.map(k => k.id));
  
  for (const log of data.logs || []) {
    const validation = validateLog(log, validLogs.length);
    
    if (!validation.valid) {
      repairs.push(`Removed corrupted log entry`);
      continue;
    }
    
    // Remove orphaned logs (key no longer exists)
    if (!keyIds.has(log.keyId)) {
      repairs.push(`Removed orphaned log (key deleted)`);
      continue;
    }
    
    validLogs.push(log);
  }
  
  // Heal defaultKeyId - clear if references non-existent key
  let defaultKeyId = data.defaultKeyId;
  if (defaultKeyId && !keyIds.has(defaultKeyId)) {
    repairs.push(`Cleared defaultKeyId (referenced deleted key)`);
    defaultKeyId = validKeys.length > 0 ? validKeys[0].id : undefined;
    if (defaultKeyId) {
      repairs.push(`Set new defaultKeyId to first available key`);
    }
  }
  
  // Heal deletedSecretIds - remove duplicates and ensure array
  const deletedSecretIds = [...new Set(data.deletedSecretIds || [])].filter(
    id => typeof id === 'string' && id.length > 0
  );
  
  if ((data.deletedSecretIds?.length || 0) !== deletedSecretIds.length) {
    repairs.push(`Cleaned deletedSecretIds (removed duplicates/invalid entries)`);
  }
  
  return {
    healed: {
      keys: validKeys,
      logs: validLogs,
      defaultKeyId,
      deletedSecretIds,
    },
    repairs,
  };
};

/**
 * Verify vault integrity and optionally self-heal
 */
export const verifyVaultIntegrity = async (
  data: VaultData,
  autoHeal: boolean = true
): Promise<{ report: IntegrityReport; healedData?: VaultData }> => {
  const issues: string[] = [];
  const repaired: string[] = [];
  
  // Check checksum
  const storedChecksum = getStoredChecksum();
  const currentChecksum = await generateChecksum(data);
  const checksumMatch = !storedChecksum || storedChecksum === currentChecksum;
  
  if (!checksumMatch) {
    issues.push('Checksum mismatch - data may have been modified externally');
  }
  
  // Validate structure
  if (!Array.isArray(data.keys)) {
    issues.push('Keys is not an array');
  }
  if (!Array.isArray(data.logs)) {
    issues.push('Logs is not an array');
  }
  
  // Validate each key
  for (let i = 0; i < (data.keys?.length || 0); i++) {
    const validation = validateKey(data.keys[i], i);
    issues.push(...validation.issues);
  }
  
  // Validate each log
  for (let i = 0; i < (data.logs?.length || 0); i++) {
    const validation = validateLog(data.logs[i], i);
    issues.push(...validation.issues);
  }
  
  // Check for orphaned references
  const keyIds = new Set((data.keys || []).map(k => k.id));
  
  if (data.defaultKeyId && !keyIds.has(data.defaultKeyId)) {
    issues.push('defaultKeyId references non-existent key');
  }
  
  for (const log of data.logs || []) {
    if (!keyIds.has(log.keyId)) {
      issues.push(`Log ${log.id} references non-existent key`);
    }
  }
  
  // Check for duplicate key IDs
  const seenIds = new Set<string>();
  for (const key of data.keys || []) {
    if (seenIds.has(key.id)) {
      issues.push(`Duplicate key ID: ${key.id}`);
    }
    seenIds.add(key.id);
  }
  
  const isValid = issues.length === 0;
  let healedData: VaultData | undefined;
  
  // Self-heal if needed
  if (!isValid && autoHeal) {
    const healResult = selfHealVault(data);
    healedData = healResult.healed;
    repaired.push(...healResult.repairs);
  }
  
  return {
    report: {
      isValid,
      checksumMatch,
      issues,
      repaired,
    },
    healedData,
  };
};

/**
 * Update checksum after vault changes
 */
export const updateVaultChecksum = async (data: VaultData): Promise<void> => {
  const checksum = await generateChecksum(data);
  saveChecksum(checksum);
};
