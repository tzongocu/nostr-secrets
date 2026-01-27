/**
 * Hook for tracking offline queue state
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  subscribeToQueue, 
  getQueue, 
  processQueue, 
  clearQueue, 
  removeFromQueue,
  hydrateQueueWithKeys,
  type QueuedSecret 
} from '@/lib/offlineQueue';
import type { NostrKey } from '@/lib/keyStore';

interface UseOfflineQueueResult {
  queue: QueuedSecret[];
  count: number;
  isProcessing: boolean;
  retryAll: () => Promise<void>;
  retryOne: (id: string) => Promise<void>;
  removeOne: (id: string) => void;
  clearAll: () => void;
  hydrateKeys: (keys: NostrKey[]) => void;
}

export const useOfflineQueue = (): UseOfflineQueueResult => {
  const [queue, setQueue] = useState<QueuedSecret[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToQueue((newQueue) => {
      setQueue(newQueue);
    });
    
    return unsubscribe;
  }, []);

  const retryAll = useCallback(async () => {
    setIsProcessing(true);
    try {
      await processQueue();
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const retryOne = useCallback(async (id: string) => {
    const item = queue.find(q => q.id === id);
    if (!item || !item.key.privateKey) return;
    
    setIsProcessing(true);
    try {
      const { sendDM } = await import('@/lib/nostrRelay');
      const result = await sendDM(item.key, item.recipientPubkeyHex, item.content);
      
      if (result.success) {
        removeFromQueue(id);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [queue]);

  const removeOne = useCallback((id: string) => {
    removeFromQueue(id);
  }, []);

  const clearAll = useCallback(() => {
    clearQueue();
  }, []);

  const hydrateKeys = useCallback((keys: NostrKey[]) => {
    hydrateQueueWithKeys(keys);
  }, []);

  return {
    queue,
    count: queue.length,
    isProcessing,
    retryAll,
    retryOne,
    removeOne,
    clearAll,
    hydrateKeys,
  };
};
