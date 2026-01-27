/**
 * Offline Queue - Retry failed relay saves automatically
 * Stores pending secrets and retries when connection is restored
 */

import type { NostrKey } from './keyStore';

export interface QueuedSecret {
  id: string;
  key: NostrKey;
  recipientPubkeyHex: string;
  content: string;
  createdAt: number;
  retryCount: number;
  lastRetry: number | null;
  error?: string;
}

interface QueueState {
  pending: QueuedSecret[];
  processing: boolean;
}

const QUEUE_STORAGE_KEY = 'nostr-offline-queue';
const MAX_RETRIES = 5;
const RETRY_DELAYS = [5000, 15000, 30000, 60000, 120000]; // 5s, 15s, 30s, 1m, 2m

let state: QueueState = {
  pending: [],
  processing: false,
};

let listeners: Array<(queue: QueuedSecret[]) => void> = [];
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// Load queue from localStorage
const loadQueue = (): void => {
  try {
    const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      state.pending = parsed.pending || [];
    }
  } catch (e) {
    console.error('[OfflineQueue] Failed to load queue:', e);
    state.pending = [];
  }
};

// Save queue to localStorage
const saveQueue = (): void => {
  try {
    // Don't store private keys in localStorage queue - only store references
    const safeQueue = state.pending.map(item => ({
      ...item,
      key: {
        id: item.key.id,
        name: item.key.name,
        publicKey: item.key.publicKey,
        // privateKey intentionally omitted for security
      }
    }));
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify({ pending: safeQueue }));
  } catch (e) {
    console.error('[OfflineQueue] Failed to save queue:', e);
  }
};

// Notify listeners
const notifyListeners = (): void => {
  listeners.forEach(fn => fn([...state.pending]));
};

/**
 * Subscribe to queue changes
 */
export const subscribeToQueue = (callback: (queue: QueuedSecret[]) => void): (() => void) => {
  listeners.push(callback);
  callback([...state.pending]);
  return () => {
    listeners = listeners.filter(fn => fn !== callback);
  };
};

/**
 * Get current queue
 */
export const getQueue = (): QueuedSecret[] => [...state.pending];

/**
 * Get queue count
 */
export const getQueueCount = (): number => state.pending.length;

/**
 * Add a failed save to the queue
 */
export const addToQueue = (
  key: NostrKey,
  recipientPubkeyHex: string,
  content: string,
  error?: string
): string => {
  const id = `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  const item: QueuedSecret = {
    id,
    key,
    recipientPubkeyHex,
    content,
    createdAt: Date.now(),
    retryCount: 0,
    lastRetry: null,
    error,
  };
  
  state.pending.push(item);
  saveQueue();
  notifyListeners();
  
  console.log('[OfflineQueue] Added to queue:', id);
  
  // Schedule retry
  scheduleRetry();
  
  return id;
};

/**
 * Remove an item from the queue
 */
export const removeFromQueue = (id: string): void => {
  state.pending = state.pending.filter(item => item.id !== id);
  saveQueue();
  notifyListeners();
};

/**
 * Clear entire queue
 */
export const clearQueue = (): void => {
  state.pending = [];
  saveQueue();
  notifyListeners();
};

/**
 * Update queue item with new key (after vault unlock)
 */
export const hydrateQueueWithKeys = (keys: NostrKey[]): void => {
  const keyMap = new Map(keys.map(k => [k.id, k]));
  
  state.pending = state.pending.map(item => {
    const fullKey = keyMap.get(item.key.id);
    if (fullKey) {
      return { ...item, key: fullKey };
    }
    return item;
  }).filter(item => item.key.privateKey); // Remove items with missing keys
  
  saveQueue();
  notifyListeners();
};

/**
 * Check if queue has items that can be retried (have full keys)
 */
export const hasRetryableItems = (): boolean => {
  return state.pending.some(item => item.key.privateKey);
};

/**
 * Schedule retry processing
 */
const scheduleRetry = (): void => {
  if (retryTimer) return;
  if (state.pending.length === 0) return;
  
  // Find next item to retry
  const now = Date.now();
  let nextRetryIn = RETRY_DELAYS[0];
  
  for (const item of state.pending) {
    if (item.retryCount >= MAX_RETRIES) continue;
    
    const delay = RETRY_DELAYS[Math.min(item.retryCount, RETRY_DELAYS.length - 1)];
    const nextRetry = (item.lastRetry || item.createdAt) + delay;
    const waitTime = Math.max(0, nextRetry - now);
    
    if (waitTime < nextRetryIn) {
      nextRetryIn = waitTime;
    }
  }
  
  console.log(`[OfflineQueue] Scheduling retry in ${nextRetryIn}ms`);
  
  retryTimer = setTimeout(() => {
    retryTimer = null;
    processQueue();
  }, nextRetryIn);
};

/**
 * Process queue - retry pending saves
 */
export const processQueue = async (sendFn?: (key: NostrKey, pubkey: string, content: string) => Promise<{ success: boolean }>): Promise<void> => {
  if (state.processing) return;
  if (state.pending.length === 0) return;
  if (!navigator.onLine) {
    console.log('[OfflineQueue] Offline, skipping retry');
    scheduleRetry();
    return;
  }
  
  state.processing = true;
  notifyListeners();
  
  const now = Date.now();
  const itemsToRetry = state.pending.filter(item => {
    // Skip if max retries exceeded
    if (item.retryCount >= MAX_RETRIES) return false;
    // Skip if no private key (not hydrated)
    if (!item.key.privateKey) return false;
    // Check if enough time has passed
    const delay = RETRY_DELAYS[Math.min(item.retryCount, RETRY_DELAYS.length - 1)];
    const nextRetry = (item.lastRetry || item.createdAt) + delay;
    return now >= nextRetry;
  });
  
  console.log(`[OfflineQueue] Processing ${itemsToRetry.length} items`);
  
  for (const item of itemsToRetry) {
    try {
      // Dynamic import to avoid circular dependency
      const { sendDM } = await import('./nostrRelay');
      const fn = sendFn || sendDM;
      
      const result = await fn(item.key, item.recipientPubkeyHex, item.content);
      
      if (result.success) {
        console.log(`[OfflineQueue] Successfully sent: ${item.id}`);
        removeFromQueue(item.id);
      } else {
        // Update retry count
        item.retryCount++;
        item.lastRetry = Date.now();
        item.error = 'Relay confirmation failed';
        saveQueue();
        notifyListeners();
        
        if (item.retryCount >= MAX_RETRIES) {
          console.log(`[OfflineQueue] Max retries reached for: ${item.id}`);
        }
      }
    } catch (e) {
      console.error(`[OfflineQueue] Retry error for ${item.id}:`, e);
      item.retryCount++;
      item.lastRetry = Date.now();
      item.error = e instanceof Error ? e.message : 'Unknown error';
      saveQueue();
      notifyListeners();
    }
  }
  
  state.processing = false;
  notifyListeners();
  
  // Schedule next retry if there are still items
  if (state.pending.length > 0) {
    scheduleRetry();
  }
};

/**
 * Initialize queue and set up listeners
 */
export const initOfflineQueue = (): void => {
  loadQueue();
  
  // Listen for online event
  window.addEventListener('online', () => {
    console.log('[OfflineQueue] Back online, processing queue...');
    processQueue();
  });
  
  // Process queue on init if online
  if (navigator.onLine && state.pending.length > 0) {
    setTimeout(() => processQueue(), 2000);
  }
};

// Initialize on module load
if (typeof window !== 'undefined') {
  initOfflineQueue();
}
