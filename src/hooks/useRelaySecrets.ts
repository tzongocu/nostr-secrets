import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  fetchSecretsFromRelays, 
  deleteSecretFromRelays, 
  hydrateSecretsMetadata,
  type RelaySecret 
} from '@/lib/relaySecrets';
import type { NostrKey } from '@/lib/keyStore';

interface UseRelaySecretsResult {
  secrets: RelaySecret[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  loadingProgress: { completed: number; total: number } | null;
  refresh: () => Promise<void>;
  deleteSecret: (eventId: string, key: NostrKey) => Promise<boolean>;
}

export const useRelaySecrets = (keys: NostrKey[]): UseRelaySecretsResult => {
  const [secrets, setSecrets] = useState<RelaySecret[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<{ completed: number; total: number } | null>(null);
  const lastFetchRef = useRef<number>(0);
  const keysRef = useRef<NostrKey[]>(keys);
  const hydratingRef = useRef(false);

  // Update keys ref
  useEffect(() => {
    keysRef.current = keys;
  }, [keys]);

  const fetchSecrets = useCallback(async () => {
    const currentKeys = keysRef.current;
    
    if (currentKeys.length === 0) {
      setSecrets([]);
      setIsConnected(false);
      setError(null);
      setLoadingProgress(null);
      return;
    }

    // Debounce - don't fetch more than once per second
    const now = Date.now();
    if (now - lastFetchRef.current < 1000) {
      return;
    }
    lastFetchRef.current = now;

    setIsLoading(true);
    setError(null);
    setLoadingProgress({ completed: 0, total: 1 });

    try {
      // Progressive loading: update UI as each relay responds
      const result = await fetchSecretsFromRelays(currentKeys, (progressSecrets, completed, total) => {
        setLoadingProgress({ completed, total });
        
        // Hydrate metadata in background and update incrementally
        if (!hydratingRef.current && progressSecrets.length > 0) {
          hydratingRef.current = true;
          hydrateSecretsMetadata(progressSecrets, currentKeys).then(hydrated => {
            setSecrets(hydrated);
            hydratingRef.current = false;
          });
        }
      });
      
      // Final hydration with all secrets
      const hydrated = await hydrateSecretsMetadata(result.secrets, currentKeys);
      setSecrets(hydrated);
      setIsConnected(result.secrets.length > 0 || result.errors.length === 0);
      
      if (result.errors.length > 0 && result.secrets.length === 0) {
        setError('Cannot connect to relays');
      }
    } catch (e) {
      console.error('[useRelaySecrets] Fetch error:', e);
      setError('Failed to fetch secrets');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
      setLoadingProgress(null);
      hydratingRef.current = false;
    }
  }, []);

  // Initial fetch when keys change
  useEffect(() => {
    if (keys.length > 0) {
      fetchSecrets();
    } else {
      setSecrets([]);
      setIsConnected(false);
    }
  }, [keys.length, fetchSecrets]);

  const refresh = useCallback(async () => {
    lastFetchRef.current = 0; // Reset debounce
    await fetchSecrets();
  }, [fetchSecrets]);

  const deleteSecret = useCallback(async (eventId: string, key: NostrKey): Promise<boolean> => {
    try {
      const result = await deleteSecretFromRelays(key, eventId);
      
      if (result.success) {
        // Remove from local state immediately
        setSecrets(prev => prev.filter(s => s.eventId !== eventId));
        return true;
      }
      
      return false;
    } catch (e) {
      console.error('[useRelaySecrets] Delete error:', e);
      return false;
    }
  }, []);

  return {
    secrets,
    isLoading,
    isConnected,
    error,
    loadingProgress,
    refresh,
    deleteSecret,
  };
};
