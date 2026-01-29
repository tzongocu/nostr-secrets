/**
 * Relay Sync Service - Ensures secrets are distributed across all relays
 * Fetches original events and forwards them to relays where they're missing
 */

import { getRelays } from './relayStore';
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

/**
 * Fetch an event by ID from a relay
 */
const fetchEventFromRelay = (
  eventId: string,
  relayUrl: string
): Promise<any | null> => {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(relayUrl);
      const subId = `fetch-${Date.now()}`;
      
      const timeout = setTimeout(() => {
        ws.close();
        resolve(null);
      }, 5000);

      ws.onopen = () => {
        ws.send(JSON.stringify(['REQ', subId, { ids: [eventId] }]));
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data[0] === 'EVENT' && data[1] === subId && data[2]?.id === eventId) {
            clearTimeout(timeout);
            ws.send(JSON.stringify(['CLOSE', subId]));
            ws.close();
            resolve(data[2]);
          } else if (data[0] === 'EOSE' && data[1] === subId) {
            // End of stored events - event not found
            clearTimeout(timeout);
            ws.close();
            resolve(null);
          }
        } catch {}
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        ws.close();
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
};

/**
 * Fetch original event from any available source relay
 */
const fetchOriginalEvent = async (
  eventId: string,
  sourceRelays: string[]
): Promise<any | null> => {
  for (const relayUrl of sourceRelays) {
    console.log(`[RelaySync] Trying to fetch event ${eventId.slice(0, 8)}... from ${relayUrl}`);
    const event = await fetchEventFromRelay(eventId, relayUrl);
    if (event) {
      console.log(`[RelaySync] Successfully fetched original event from ${relayUrl}`);
      return event;
    }
  }
  console.log(`[RelaySync] Failed to fetch event from any source relay`);
  return null;
};

/**
 * Republish a secret to specific relays
 * Fetches the original event and forwards it to missing relays
 */
export const republishToRelays = async (
  secret: RelaySecret,
  _key: NostrKey, // No longer needed but kept for API compatibility
  targetRelays: string[]
): Promise<{ success: string[]; failed: string[] }> => {
  if (targetRelays.length === 0) {
    return { success: [], failed: [] };
  }

  // Fetch the original signed event from a relay that has it
  const originalEvent = await fetchOriginalEvent(secret.eventId, secret.relays);
  
  if (!originalEvent) {
    console.log(`[RelaySync] Could not fetch original event for ${secret.title}`);
    return { success: [], failed: targetRelays };
  }

  // Forward the exact original event to target relays
  const results = await Promise.all(
    targetRelays.map(async (relayUrl) => {
      try {
        return await sendEventToRelay(relayUrl, originalEvent);
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
