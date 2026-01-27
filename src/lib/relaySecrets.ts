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
  relay: string;
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
 * Fetch secrets from all configured relays for the given keys
 */
export const fetchSecretsFromRelays = async (
  keys: NostrKey[]
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
  const seenIds = new Set<string>();

  // Build pubkey list
  const pubkeys = keys.map(k => npubToHex(k.publicKey));

  // Fetch from all relays in parallel
  const fetchPromises = relays.map(async (relayUrl) => {
    try {
      const secrets = await fetchFromRelay(relayUrl, keys, pubkeys);
      return { relayUrl, secrets, error: null };
    } catch (e) {
      return { relayUrl, secrets: [], error: `${relayUrl}: ${e}` };
    }
  });

  const results = await Promise.all(fetchPromises);

  for (const result of results) {
    if (result.error) {
      errors.push(result.error);
    }
    for (const secret of result.secrets) {
      if (!seenIds.has(secret.id)) {
        seenIds.add(secret.id);
        allSecrets.push(secret);
      }
    }
  }

  // Sort by date, newest first
  allSecrets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { secrets: allSecrets, errors };
};

/**
 * Fetch secrets from a single relay
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
    
    const timeout = setTimeout(() => {
      ws.close();
      resolve(secrets); // Return what we have
    }, 10000);

    ws.onopen = () => {
      // Request self-addressed DMs (kind 4 where author = recipient)
      const filter = {
        kinds: [4],
        authors: pubkeys,
        '#p': pubkeys,
        limit: 100,
      };
      console.log('[RelaySecrets] Fetching with filter:', { 
        relay: relayUrl, 
        pubkeys: pubkeys.map(p => p.slice(0, 16) + '...'),
        keyNames: keys.map(k => k.name)
      });
      ws.send(JSON.stringify(['REQ', subId, filter]));
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data[0] === 'EVENT' && data[1] === subId) {
          const nostrEvent = data[2];
          const secret = await parseSecretEvent(nostrEvent, keys, relayUrl);
          if (secret) {
            secrets.push(secret);
          }
        } else if (data[0] === 'EOSE') {
          // End of stored events
          clearTimeout(timeout);
          ws.close();
          resolve(secrets);
        }
      } catch (e) {
        console.error('[RelaySecrets] Parse error:', e);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Connection failed'));
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      resolve(secrets);
    };
  });
};

/**
 * Parse a Nostr event into a RelaySecret
 */
const parseSecretEvent = async (
  event: any,
  keys: NostrKey[],
  relay: string
): Promise<RelaySecret | null> => {
  try {
    // Find the recipient from p tag
    const pTags = event.tags.filter((t: string[]) => t[0] === 'p');
    const recipientHex = pTags.length > 0 ? pTags[0][1] : null;
    
    console.log('[RelaySecrets] Event received:', {
      eventId: event.id.slice(0, 12),
      authorPubkey: event.pubkey.slice(0, 16) + '...',
      recipientPubkey: recipientHex?.slice(0, 16) + '...',
      isSelfAddressed: event.pubkey === recipientHex
    });
    
    // Check if this is a self-addressed DM (author = recipient)
    if (event.pubkey !== recipientHex) {
      console.log('[RelaySecrets] Skipping: not self-addressed DM');
      return null;
    }

    // Find the key that owns this secret - STRICT CHECK
    const key = keys.find(k => {
      const keyPubHex = npubToHex(k.publicKey);
      const matches = keyPubHex === event.pubkey;
      console.log('[RelaySecrets] Comparing key:', { 
        keyName: k.name, 
        keyPubHex: keyPubHex.slice(0, 16) + '...', 
        eventPubkey: event.pubkey.slice(0, 16) + '...',
        matches 
      });
      return matches;
    });
    
    if (!key) {
      console.log('[RelaySecrets] Skipping: no matching key found in vault');
      return null;
    }
    
    console.log('[RelaySecrets] ✓ Matched to key:', key.name, key.id);

    // Decrypt the DM content
    const decrypted = await decryptNIP04(event.content, key.privateKey, event.pubkey);
    if (!decrypted) {
      return null;
    }

    // Parse the JSON payload
    let payload: NostrSecretPayload;
    try {
      payload = JSON.parse(decrypted);
    } catch {
      return null;
    }

    // Validate it's a nostr-secret
    if (payload.type !== 'nostr-secret') {
      return null;
    }

    // Detect encryption version from payload or ciphertext format
    const encryptionVersion = payload.version || detectEncryptionVersion(payload.content);
    
    return {
      id: event.id,
      eventId: event.id,
      title: payload.title || 'Untitled',
      encryptedContent: payload.content,
      encryptionVersion,
      tags: payload.tags || [],
      keyId: key.id,
      keyName: key.name,
      createdAt: new Date(event.created_at * 1000),
      relay,
    };
  } catch (e) {
    console.error('[RelaySecrets] Parse event error:', e);
    return null;
  }
};

/**
 * Delete a secret from relays using NIP-09 deletion event
 */
export const deleteSecretFromRelays = async (
  key: NostrKey,
  eventId: string
): Promise<{ success: boolean; confirmedRelays: number }> => {
  const relays = getRelays();
  if (relays.length === 0) {
    return { success: false, confirmedRelays: 0 };
  }

  const privBytes = nsecToBytes(key.privateKey);
  const privHex = bytesToHex(privBytes);
  const pubkeyHex = npubToHex(key.publicKey);
  const created_at = Math.floor(Date.now() / 1000);

  // Create NIP-09 deletion event
  const event = {
    kind: 5,
    pubkey: pubkeyHex,
    created_at,
    tags: [['e', eventId]],
    content: 'secret deleted',
  };

  // Serialize for signing
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);

  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  const eventIdHash = bytesToHex(new Uint8Array(hash));

  // Sign event
  const messageBytes = hexToBytes(eventIdHash);
  const signPrivBytes = hexToBytes(privHex);
  const sigBytes = await secp256k1.schnorr.signAsync(messageBytes, signPrivBytes);
  const sigHex = bytesToHex(sigBytes);

  const signedEvent = {
    ...event,
    id: eventIdHash,
    sig: sigHex,
  };

  // Send to all relays
  const sendPromises = relays.map(async (url) => {
    try {
      const ws = new WebSocket(url);
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 5000);

        ws.onopen = () => {
          ws.send(JSON.stringify(['EVENT', signedEvent]));
        };

        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data[0] === 'OK' && data[1] === eventIdHash) {
              clearTimeout(timeout);
              ws.close();
              resolve(data[2] === true);
            }
          } catch {}
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
      });
    } catch {
      return false;
    }
  });

  const results = await Promise.all(sendPromises);
  const confirmedRelays = results.filter(r => r).length;

  return {
    success: confirmedRelays > 0,
    confirmedRelays,
  };
};
