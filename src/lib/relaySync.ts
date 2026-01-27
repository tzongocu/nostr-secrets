/**
 * Relay Sync Service - Ensures secrets are distributed across all relays
 * Automatically republishes secrets to relays where they're missing
 */

import * as secp256k1 from '@noble/secp256k1';
import { getRelays } from './relayStore';
import { npubToHex, nsecToHex, encryptNIP04 } from './nostrRelay';
import type { NostrKey } from './keyStore';
import type { RelaySecret } from './relaySecrets';

export interface SyncStatus {
  secretId: string;
  title: string;
  currentRelays: string[];
  missingRelays: string[];
  totalRelays: number;
  syncProgress: number; // 0-100
}

export interface SyncResult {
  secretId: string;
  newlySynced: string[];
  failed: string[];
}

interface SyncState {
  isRunning: boolean;
  lastRun: number | null;
  results: SyncResult[];
}

let state: SyncState = {
  isRunning: false,
  lastRun: null,
  results: [],
};

let listeners: Array<(state: SyncState) => void> = [];

const notifyListeners = (): void => {
  listeners.forEach(fn => fn({ ...state }));
};

/**
 * Subscribe to sync state changes
 */
export const subscribeToSync = (callback: (state: SyncState) => void): (() => void) => {
  listeners.push(callback);
  callback({ ...state });
  return () => {
    listeners = listeners.filter(fn => fn !== callback);
  };
};

/**
 * Get sync status for all secrets
 */
export const getSyncStatus = (secrets: RelaySecret[]): SyncStatus[] => {
  const allRelays = getRelays();
  
  return secrets.map(secret => {
    const missingRelays = allRelays.filter(r => !secret.relays.includes(r));
    const syncProgress = allRelays.length > 0 
      ? Math.round((secret.relays.length / allRelays.length) * 100)
      : 100;
    
    return {
      secretId: secret.id,
      title: secret.title,
      currentRelays: secret.relays,
      missingRelays,
      totalRelays: allRelays.length,
      syncProgress,
    };
  });
};

/**
 * Get secrets that need syncing (not on all relays)
 */
export const getSecretsNeedingSync = (secrets: RelaySecret[]): SyncStatus[] => {
  return getSyncStatus(secrets).filter(s => s.missingRelays.length > 0);
};

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
 * Republish a secret to specific relays
 * This fetches the original event and sends it to missing relays
 */
export const republishToRelays = async (
  secret: RelaySecret,
  key: NostrKey,
  targetRelays: string[]
): Promise<{ success: string[]; failed: string[] }> => {
  if (targetRelays.length === 0) {
    return { success: [], failed: [] };
  }

  // We need to recreate the original event
  // The secret contains the encrypted content, we need to re-wrap it as a DM
  const pubkeyHex = npubToHex(key.publicKey);
  const privBytes = nsecToBytes(key.privateKey);
  const privHex = bytesToHex(privBytes);

  // Create the DM payload (same format as original)
  const dmPayload = JSON.stringify({
    type: 'nostr-secret',
    version: secret.encryptionVersion,
    title: secret.title,
    tags: secret.tags,
    content: secret.encryptedContent,
  });

  // Encrypt the payload
  const encrypted = await encryptNIP04(dmPayload, key.privateKey, pubkeyHex);
  if (!encrypted) {
    return { success: [], failed: targetRelays };
  }

  const created_at = Math.floor(Date.now() / 1000);
  
  const event = {
    kind: 4,
    pubkey: pubkeyHex,
    created_at,
    tags: [['p', pubkeyHex]], // Self-addressed DM
    content: encrypted,
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
  const eventId = bytesToHex(new Uint8Array(hash));

  // Sign event
  const messageBytes = hexToBytes(eventId);
  const signPrivBytes = hexToBytes(privHex);
  const sigBytes = await secp256k1.schnorr.signAsync(messageBytes, signPrivBytes);
  const sigHex = bytesToHex(sigBytes);

  const signedEvent = {
    ...event,
    id: eventId,
    sig: sigHex,
  };

  // Send to target relays
  const results = await Promise.all(
    targetRelays.map(async (relayUrl) => {
      try {
        return await sendEventToRelay(relayUrl, signedEvent);
      } catch {
        return { url: relayUrl, success: false };
      }
    })
  );

  const success = results.filter(r => r.success).map(r => r.url);
  const failed = results.filter(r => !r.success).map(r => r.url);

  return { success, failed };
};

/**
 * Send a signed event to a single relay
 */
const sendEventToRelay = (
  relayUrl: string,
  signedEvent: any
): Promise<{ url: string; success: boolean }> => {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(relayUrl);
      
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ url: relayUrl, success: false });
      }, 10000);

      ws.onopen = () => {
        ws.send(JSON.stringify(['EVENT', signedEvent]));
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data[0] === 'OK' && data[1] === signedEvent.id) {
            clearTimeout(timeout);
            ws.close();
            resolve({ url: relayUrl, success: data[2] === true });
          }
        } catch {}
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        ws.close();
        resolve({ url: relayUrl, success: false });
      };
    } catch {
      resolve({ url: relayUrl, success: false });
    }
  });
};

/**
 * Sync all secrets to all relays
 */
export const syncAllSecrets = async (
  secrets: RelaySecret[],
  keys: NostrKey[],
  onProgress?: (current: number, total: number, secretTitle: string) => void
): Promise<SyncResult[]> => {
  if (state.isRunning) {
    console.log('[RelaySync] Sync already in progress');
    return [];
  }

  state.isRunning = true;
  state.results = [];
  notifyListeners();

  const keyMap = new Map(keys.map(k => [k.id, k]));
  const needsSync = getSecretsNeedingSync(secrets);
  const results: SyncResult[] = [];

  console.log(`[RelaySync] Starting sync for ${needsSync.length} secrets`);

  for (let i = 0; i < needsSync.length; i++) {
    const status = needsSync[i];
    const secret = secrets.find(s => s.id === status.secretId);
    const key = secret ? keyMap.get(secret.keyId) : null;

    if (!secret || !key) {
      console.log(`[RelaySync] Skipping ${status.secretId} - missing secret or key`);
      continue;
    }

    onProgress?.(i + 1, needsSync.length, secret.title);

    const result = await republishToRelays(secret, key, status.missingRelays);
    
    results.push({
      secretId: secret.id,
      newlySynced: result.success,
      failed: result.failed,
    });

    console.log(`[RelaySync] ${secret.title}: ${result.success.length} synced, ${result.failed.length} failed`);
  }

  state.isRunning = false;
  state.lastRun = Date.now();
  state.results = results;
  notifyListeners();

  return results;
};

/**
 * Sync a single secret to missing relays
 */
export const syncSingleSecret = async (
  secret: RelaySecret,
  key: NostrKey
): Promise<SyncResult> => {
  const allRelays = getRelays();
  const missingRelays = allRelays.filter(r => !secret.relays.includes(r));

  if (missingRelays.length === 0) {
    return { secretId: secret.id, newlySynced: [], failed: [] };
  }

  const result = await republishToRelays(secret, key, missingRelays);

  return {
    secretId: secret.id,
    newlySynced: result.success,
    failed: result.failed,
  };
};

/**
 * Get current sync state
 */
export const getSyncState = (): SyncState => ({ ...state });

/**
 * Check if sync is running
 */
export const isSyncing = (): boolean => state.isRunning;
