/**
 * Local store for tracking soft-deleted secrets
 * Since relay deletion (NIP-09) may not always work, we track deleted IDs locally
 */

const STORAGE_KEY = 'nostr-secrets-deleted';

export const getDeletedSecretIds = (): string[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
};

export const markSecretAsDeleted = (eventId: string): void => {
  const deleted = getDeletedSecretIds();
  if (!deleted.includes(eventId)) {
    deleted.push(eventId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deleted));
  }
};

export const unmarkSecretAsDeleted = (eventId: string): void => {
  const deleted = getDeletedSecretIds();
  const filtered = deleted.filter(id => id !== eventId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
};

export const isSecretDeleted = (eventId: string): boolean => {
  return getDeletedSecretIds().includes(eventId);
};

export const clearDeletedSecrets = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
