/**
 * Secret Store - Types and utilities for managing encrypted secrets
 */

export interface Secret {
  id: string;
  title: string;
  encryptedContent: string;
  decryptedContent?: string; // Only set when decrypted in memory
  tags: string[];
  keyId: string; // The key used to encrypt this secret
  createdAt: Date;
  updatedAt: Date;
  // Nostr DM metadata (when synced to relay)
  nostrEventId?: string;
  syncedAt?: Date;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export const TAG_COLORS = [
  { name: 'Purple', value: 'hsl(270, 80%, 65%)' },
  { name: 'Blue', value: 'hsl(210, 100%, 60%)' },
  { name: 'Cyan', value: 'hsl(180, 100%, 45%)' },
  { name: 'Green', value: 'hsl(140, 70%, 45%)' },
  { name: 'Yellow', value: 'hsl(50, 100%, 50%)' },
  { name: 'Orange', value: 'hsl(30, 100%, 55%)' },
  { name: 'Red', value: 'hsl(0, 80%, 60%)' },
  { name: 'Pink', value: 'hsl(330, 80%, 65%)' },
];

// Get stored tags
export const getStoredTags = (): Tag[] => {
  const stored = localStorage.getItem('nostr-secrets-tags');
  if (stored) {
    return JSON.parse(stored);
  }
  // Default tags
  return [
    { id: 'passwords', name: 'Passwords', color: TAG_COLORS[0].value },
    { id: 'seeds', name: 'Seeds', color: TAG_COLORS[3].value },
    { id: 'notes', name: 'Notes', color: TAG_COLORS[1].value },
    { id: 'api-keys', name: 'API Keys', color: TAG_COLORS[5].value },
  ];
};

// Save tags
export const saveTags = (tags: Tag[]): void => {
  localStorage.setItem('nostr-secrets-tags', JSON.stringify(tags));
};

// Add a new tag
export const addTag = (name: string, color: string): Tag => {
  const tags = getStoredTags();
  const newTag: Tag = {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    color,
  };
  tags.push(newTag);
  saveTags(tags);
  return newTag;
};

// Delete a tag
export const deleteTag = (id: string): void => {
  const tags = getStoredTags().filter(t => t.id !== id);
  saveTags(tags);
};
