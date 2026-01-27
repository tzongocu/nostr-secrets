/**
 * Hook for relay sync functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  getSyncStatus, 
  getSecretsNeedingSync,
  syncAllSecrets,
  syncSingleSecret,
  subscribeToSync,
  type SyncStatus,
  type SyncResult,
} from '@/lib/relaySync';
import type { RelaySecret } from '@/lib/relaySecrets';
import type { NostrKey } from '@/lib/keyStore';
import { toast } from 'sonner';

interface UseRelaySyncResult {
  syncStatus: SyncStatus[];
  needsSync: number;
  isRunning: boolean;
  lastRun: number | null;
  syncAll: () => Promise<void>;
  syncOne: (secret: RelaySecret) => Promise<SyncResult | null>;
}

export const useRelaySync = (
  secrets: RelaySecret[],
  keys: NostrKey[]
): UseRelaySyncResult => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<number | null>(null);

  // Update sync status when secrets change
  useEffect(() => {
    const status = getSyncStatus(secrets);
    setSyncStatus(status);
  }, [secrets]);

  // Subscribe to sync state
  useEffect(() => {
    const unsubscribe = subscribeToSync((state) => {
      setIsRunning(state.isRunning);
      setLastRun(state.lastRun);
    });
    return unsubscribe;
  }, []);

  const needsSync = syncStatus.filter(s => s.missingRelays.length > 0).length;

  const syncAll = useCallback(async () => {
    if (isRunning) return;
    
    const needsSyncSecrets = getSecretsNeedingSync(secrets);
    if (needsSyncSecrets.length === 0) {
      toast.info('All secrets are fully synced');
      return;
    }

    toast.info(`Syncing ${needsSyncSecrets.length} secrets...`);

    const results = await syncAllSecrets(secrets, keys, (current, total, title) => {
      // Progress callback
      console.log(`[Sync] ${current}/${total}: ${title}`);
    });

    const totalSynced = results.reduce((sum, r) => sum + r.newlySynced.length, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed.length, 0);

    if (totalSynced > 0) {
      toast.success(`Synced to ${totalSynced} new relay(s)`, {
        description: totalFailed > 0 ? `${totalFailed} failed` : undefined
      });
    } else if (totalFailed > 0) {
      toast.error(`Sync failed for ${totalFailed} relay(s)`);
    }

    // Refresh sync status
    setSyncStatus(getSyncStatus(secrets));
  }, [secrets, keys, isRunning]);

  const syncOne = useCallback(async (secret: RelaySecret): Promise<SyncResult | null> => {
    const key = keys.find(k => k.id === secret.keyId);
    if (!key) {
      toast.error('Key not found');
      return null;
    }

    const status = syncStatus.find(s => s.secretId === secret.id);
    if (!status || status.missingRelays.length === 0) {
      toast.info('Already synced to all relays');
      return null;
    }

    toast.info(`Syncing to ${status.missingRelays.length} relay(s)...`);

    const result = await syncSingleSecret(secret, key);

    if (result.newlySynced.length > 0) {
      toast.success(`Synced to ${result.newlySynced.length} new relay(s)`);
    } else if (result.failed.length > 0) {
      toast.error(`Failed to sync to ${result.failed.length} relay(s)`);
    }

    // Refresh sync status
    setSyncStatus(getSyncStatus(secrets));

    return result;
  }, [keys, secrets, syncStatus]);

  return {
    syncStatus,
    needsSync,
    isRunning,
    lastRun,
    syncAll,
    syncOne,
  };
};
