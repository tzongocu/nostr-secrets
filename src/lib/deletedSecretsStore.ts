/**
 * Local store for tracking soft-deleted secrets
 * DEPRECATED: Now migrates data to encrypted vault storage
 * This module exists only for backward compatibility and migration
 */

const LEGACY_STORAGE_KEY = 'nostr-secrets-deleted';

/**
 * Check if there are legacy deleted IDs in localStorage that need migration
 */
export const hasLegacyDeletedSecrets = (): boolean => {
  return !!localStorage.getItem(LEGACY_STORAGE_KEY);
};

/**
 * Migrate legacy deleted secret IDs from localStorage to vault
 * Returns the IDs and removes them from localStorage
 */
export const migrateLegacyDeletedSecrets = (): string[] => {
  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return [];
    
    const ids = JSON.parse(stored);
    // Remove legacy storage after reading
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return Array.isArray(ids) ? ids : [];
  } catch {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return [];
  }
};

// ============ LEGACY FUNCTIONS (for backward compatibility during transition) ============

/** @deprecated Use VaultContext.deletedSecretIds instead */
export const getDeletedSecretIds = (): string[] => {
  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
};

/** @deprecated Use VaultContext.markDeleted instead */
export const markSecretAsDeleted = (eventId: string): void => {
  const deleted = getDeletedSecretIds();
  if (!deleted.includes(eventId)) {
    deleted.push(eventId);
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(deleted));
  }
};

/** @deprecated Use VaultContext.unmarkDeleted instead */
export const unmarkSecretAsDeleted = (eventId: string): void => {
  const deleted = getDeletedSecretIds();
  const filtered = deleted.filter(id => id !== eventId);
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(filtered));
};

/** @deprecated Use VaultContext.deletedSecretIds instead */
export const isSecretDeleted = (eventId: string): boolean => {
  return getDeletedSecretIds().includes(eventId);
};

/** @deprecated Use VaultContext.clearDeletedSecrets instead */
export const clearDeletedSecrets = (): void => {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
};
