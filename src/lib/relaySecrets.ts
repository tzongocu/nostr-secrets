/**
 * Relay Secrets - Fetch and manage secrets from Nostr relays
 * Secrets are stored as self-addressed DMs (kind 4) with type: 'nostr-secret'
 * 
 * Encryption versions:
 * - Version 1: NIP-04 (AES-256-CBC, deprecated)
 * - Version 2: NIP-44 (ChaCha20 + HMAC-SHA256, recommended)
 */

import * as secp256k1 from '@noble/secp256k1';
import { getRelays } from './relayStore';
import { decryptNIP04, npubToHex, nsecToHex } from './nostrRelay';
import { getConversationKey, decryptNIP44, detectEncryptionVersion } from './nip44';
import type { NostrKey } from './keyStore';

export interface RelaySecret {
  id: string; // Nostr event ID
  eventId: string; // Same as id, for clarity
  title: string;
  encryptedContent: string;
  encryptionVersion: number; // 1 = NIP-04, 2 = NIP-44
  tags: string[];
  keyId: string;
  keyName: string;
  createdAt: Date;
  relays: string[]; // All relays where this secret was found
}

interface NostrSecretPayload {
  type: 'nostr-secret';
  version: number;
  title: string;
  tags: string[];
  content: string; // encrypted content
}

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

const nsecToBytes = (nsec: string): Uint8Array => {
  const { bech32 } = require('@scure/base');
  const decoded = bech32.decode(nsec, 1500);
  return new Uint8Array(bech32.fromWords(decoded.words));
};

/**
 * Progressive callback for streaming results
 */
export type OnSecretsProgress = (secrets: RelaySecret[], completedRelays: number, totalRelays: number) => void;

/**
 * Fetch secrets from all configured relays for the given keys
 * Now supports progressive loading via onProgress callback
 */
export const fetchSecretsFromRelays = async (
  keys: NostrKey[],
  onProgress?: OnSecretsProgress
): Promise<{ secrets: RelaySecret[]; errors: string[] }> => {
  if (keys.length === 0) {
    return { secrets: [], errors: [] };
  }

  const relays = getRelays();
  if (relays.length === 0) {
    return { secrets: [], errors: ['No relays configured'] };
  }

  const allSecrets: RelaySecret[] = [];
  const errors: string[] = [];
  const seenIds = new Map<string, RelaySecret>();
  let completedCount = 0;

  // Build pubkey list
  const pubkeys = keys.map(k => npubToHex(k.publicKey));

  // Helper to merge secrets and notify
  const mergeAndNotify = (relayUrl: string, newSecrets: RelaySecret[]) => {
    for (const secret of newSecrets) {
      const existing = seenIds.get(secret.id);
      if (existing) {
        // Aggregate relays for duplicate secrets
        if (!existing.relays.includes(relayUrl)) {
          existing.relays.push(relayUrl);
        }
      } else {
        const secretWithRelay = { ...secret, relays: [relayUrl] };
        seenIds.set(secret.id, secretWithRelay);
        allSecrets.push(secretWithRelay);
      }
    }

    completedCount++;
    
    // Sort by date and notify
    const sorted = [...allSecrets].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    onProgress?.(sorted, completedCount, relays.length);
  };

  // Fetch from all relays in parallel, but report progress as each completes
  const fetchPromises = relays.map(async (relayUrl) => {
    try {
      const secrets = await fetchFromRelay(relayUrl, keys, pubkeys);
      mergeAndNotify(relayUrl, secrets);
      return { relayUrl, error: null };
    } catch (e) {
      completedCount++;
      onProgress?.([...allSecrets].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()), completedCount, relays.length);
      return { relayUrl, error: `${relayUrl}: ${e}` };
    }
  });

  const results = await Promise.all(fetchPromises);

  for (const result of results) {
    if (result.error) {
      errors.push(result.error);
    }
  }

  // Final sort
  allSecrets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { secrets: allSecrets, errors };
};

/**
 * Fetch secrets from a single relay with shorter timeout for faster response
 */
const fetchFromRelay = async (
  relayUrl: string,
  keys: NostrKey[],
  pubkeys: string[]
): Promise<RelaySecret[]> => {
  return new Promise((resolve, reject) => {
    const secrets: RelaySecret[] = [];
    const ws = new WebSocket(relayUrl);
    const subId = `secrets-${Math.random().toString(36).slice(2, 10)}`;
    
    // Reduced timeout for faster feedback (5s instead of 10s)
    const timeout = setTimeout(() => {
      ws.close();
      resolve(secrets); // Return what we have
    }, 5000);

    ws.onopen = () => {
      // Request self-addressed DMs (kind 4 where author = recipient)
      const filter = {
        kinds: [4],
        authors: pubkeys,
        '#p': pubkeys,
        limit: 100,
      };
      console.log('[RelaySecrets] Fetching from:', relayUrl.replace('wss://', '').slice(0, 20));
      ws.send(JSON.stringify(['REQ', subId, filter]));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data[0] === 'EVENT' && data[1] === subId) {
          const nostrEvent = data[2];
          const secret = parseSecretEvent(nostrEvent, keys);
          if (secret) {
            secrets.push(secret);
          }
        } else if (data[0] === 'EOSE') {
          clearTimeout(timeout);
          ws.close();
          resolve(secrets);
        }
      } catch (e) {
        console.error('[RelaySecrets] Parse error:', e);
      }
    };

    ws.onerror = (e) => {
      clearTimeout(timeout);
      reject(new Error('WebSocket error'));
    };

    ws.onclose = () => {
      clearTimeout(timeout);
    };
  });
};

/**
 * Parse a Nostr event into a RelaySecret
 */
const parseSecretEvent = (event: any, keys: NostrKey[]): RelaySecret | null => {
  try {
    // Find which key this secret belongs to
    const authorPubkey = event.pubkey;
    const key = keys.find(k => npubToHex(k.publicKey) === authorPubkey);
    if (!key) return null;

    // Get recipient from p tag
    const pTag = event.tags?.find((t: string[]) => t[0] === 'p');
    const recipientPubkey = pTag?.[1];
    
    // Must be self-addressed
    if (recipientPubkey !== authorPubkey) return null;

    // Detect encryption version from content format
    const encryptionVersion = detectEncryptionVersion(event.content);

    // Try to parse the content to validate it's a secret
    // The actual content decryption happens on-demand
    let title = 'Encrypted Secret';
    let tags: string[] = [];
    
    // Try to extract metadata from the event content
    // The content is encrypted, so we can't read it here
    // We'll use the encrypted content as-is and decrypt on demand

    return {
      id: event.id,
      eventId: event.id,
      title: `Secret ${event.id.slice(0, 8)}`, // Placeholder until decrypted
      encryptedContent: event.content,
      encryptionVersion,
      tags: [],
      keyId: key.publicKey,
      keyName: key.name,
      createdAt: new Date(event.created_at * 1000),
      relays: [],
    };
  } catch (e) {
    console.error('[RelaySecrets] Parse event error:', e);
    return null;
  }
};

/**
 * Decrypt secret content and extract metadata
 */
export const decryptSecretContent = async (
  secret: RelaySecret,
  key: NostrKey
): Promise<{ title: string; content: string; tags: string[] } | null> => {
  try {
    const privKeyHex = nsecToHex(key.privateKey);
    const pubKeyHex = npubToHex(key.publicKey);
    
    let decrypted: string;
    
    if (secret.encryptionVersion === 2) {
      // NIP-44
      const privKeyBytes = hexToBytes(privKeyHex);
      const pubKeyBytes = hexToBytes(pubKeyHex);
      const conversationKey = await getConversationKey(bytesToHex(privKeyBytes), bytesToHex(pubKeyBytes));
      decrypted = await decryptNIP44(secret.encryptedContent, conversationKey);
    } else {
      // NIP-04 fallback
      decrypted = await decryptNIP04(secret.encryptedContent, privKeyHex, pubKeyHex);
    }

    let payload: NostrSecretPayload;
    try {
      payload = JSON.parse(decrypted) as NostrSecretPayload;
    } catch {
      // Not valid JSON - not a secret
      return null;
    }
    
    if (!payload || payload.type !== 'nostr-secret') {
      return null;
    }

    return {
      title: payload.title,
      content: payload.content,
      tags: payload.tags || [],
    };
  } catch (e) {
    console.error('[RelaySecrets] Decrypt error:', e);
    return null;
  }
};

/**
 * Decrypt and hydrate secret metadata (title, tags) without revealing content
 */
export const hydrateSecretMetadata = async (
  secret: RelaySecret,
  key: NostrKey
): Promise<RelaySecret | null> => {
  try {
    const result = await decryptSecretContent(secret, key);
    if (!result) return null;

    return {
      ...secret,
      title: result.title,
      tags: result.tags,
    };
  } catch (e) {
    return null;
  }
};

/**
 * Batch hydrate secrets metadata
 */
export const hydrateSecretsMetadata = async (
  secrets: RelaySecret[],
  keys: NostrKey[]
): Promise<RelaySecret[]> => {
  const keyMap = new Map(keys.map(k => [k.publicKey, k]));
  
  const results = await Promise.all(
    secrets.map(async (secret) => {
      const key = keyMap.get(secret.keyId);
      if (!key) return null; // No key = can't decrypt = skip
      
      const result = await hydrateSecretMetadata(secret, key);
      // Only return valid nostr-secrets, skip DMs that aren't secrets
      return result;
    })
  );

  // Filter out nulls (DMs that aren't secrets or failed to decrypt)
  return results.filter((s): s is RelaySecret => s !== null);
};

/**
 * Save a secret to relays
 */
export const saveSecretToRelays = async (
  key: NostrKey,
  title: string,
  content: string,
  tags: string[]
): Promise<{ success: boolean; eventId?: string; relays: string[] }> => {
  const relays = getRelays();
  if (relays.length === 0) {
    return { success: false, relays: [] };
  }

  try {
    const privKeyHex = nsecToHex(key.privateKey);
    const pubKeyHex = npubToHex(key.publicKey);
    const privKeyBytes = hexToBytes(privKeyHex);
    const pubKeyBytes = hexToBytes(pubKeyHex);

    // Create payload
    const payload: NostrSecretPayload = {
      type: 'nostr-secret',
      version: 2,
      title,
      tags,
      content,
    };

    // Encrypt with NIP-44
    const { encryptNIP44 } = await import('./nip44');
    const conversationKey = await getConversationKey(privKeyHex, pubKeyHex);
    const encrypted = await encryptNIP44(JSON.stringify(payload), conversationKey);

    // Create Nostr event
    const event = {
      kind: 4,
      pubkey: pubKeyHex,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', pubKeyHex]],
      content: encrypted,
    };

    // Sign event
    const eventHash = await hashEvent(event);
    const sigBytes = await secp256k1.signAsync(eventHash, privKeyBytes);
    const sig = sigBytes instanceof Uint8Array ? sigBytes : new Uint8Array(sigBytes);
    const signedEvent = {
      ...event,
      id: bytesToHex(eventHash),
      sig: bytesToHex(sig),
    };

    // Send to all relays
    const successfulRelays: string[] = [];
    
    await Promise.all(relays.map(async (relayUrl) => {
      try {
        const success = await sendToRelay(relayUrl, signedEvent);
        if (success) {
          successfulRelays.push(relayUrl);
        }
      } catch (e) {
        console.error(`[RelaySecrets] Failed to send to ${relayUrl}:`, e);
      }
    }));

    if (successfulRelays.length === 0) {
      return { success: false, relays: [] };
    }

    return {
      success: true,
      eventId: signedEvent.id,
      relays: successfulRelays,
    };
  } catch (e) {
    console.error('[RelaySecrets] Save error:', e);
    return { success: false, relays: [] };
  }
};

/**
 * Delete a secret from relays (NIP-09 deletion)
 */
export const deleteSecretFromRelays = async (
  key: NostrKey,
  eventId: string
): Promise<{ success: boolean; relays: string[] }> => {
  const relays = getRelays();
  if (relays.length === 0) {
    return { success: false, relays: [] };
  }

  try {
    const privKeyHex = nsecToHex(key.privateKey);
    const pubKeyHex = npubToHex(key.publicKey);
    const privKeyBytes = hexToBytes(privKeyHex);

    // Create deletion event (NIP-09)
    const event = {
      kind: 5,
      pubkey: pubKeyHex,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', eventId]],
      content: 'deleted',
    };

    // Sign event
    const eventHash = await hashEvent(event);
    const sigBytes = await secp256k1.signAsync(eventHash, privKeyBytes);
    const sig = sigBytes instanceof Uint8Array ? sigBytes : new Uint8Array(sigBytes);
    const signedEvent = {
      ...event,
      id: bytesToHex(eventHash),
      sig: bytesToHex(sig),
    };

    // Send to all relays
    const successfulRelays: string[] = [];
    
    await Promise.all(relays.map(async (relayUrl) => {
      try {
        const success = await sendToRelay(relayUrl, signedEvent);
        if (success) {
          successfulRelays.push(relayUrl);
        }
      } catch (e) {
        console.error(`[RelaySecrets] Failed to delete from ${relayUrl}:`, e);
      }
    }));

    return {
      success: successfulRelays.length > 0,
      relays: successfulRelays,
    };
  } catch (e) {
    console.error('[RelaySecrets] Delete error:', e);
    return { success: false, relays: [] };
  }
};

/**
 * Send a signed event to a relay
 */
const sendToRelay = (relayUrl: string, event: any): Promise<boolean> => {
  return new Promise((resolve) => {
    const ws = new WebSocket(relayUrl);
    
    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 5000);

    ws.onopen = () => {
      ws.send(JSON.stringify(['EVENT', event]));
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data[0] === 'OK' && data[1] === event.id) {
          clearTimeout(timeout);
          ws.close();
          resolve(data[2] === true);
        }
      } catch (e) {
        // ignore
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
  });
};

/**
 * Hash a Nostr event for signing
 */
const hashEvent = async (event: any): Promise<Uint8Array> => {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  const encoder = new TextEncoder();
  const data = encoder.encode(serialized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
};
