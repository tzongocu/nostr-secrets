import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Lock, Plus, Search, Tag, Eye, EyeOff, Copy, Check, Trash2, X, Key, ChevronDown, ChevronUp, RefreshCw, Loader2, WifiOff, RotateCcw, Archive, Radio, CloudOff, CloudUpload, Clock } from 'lucide-react';
import { useVault } from '@/context/VaultContext';
import { getStoredTags, type Tag as TagType } from '@/lib/secretStore';
import { KEY_COLORS } from '@/lib/keyStore';
import { decryptNIP04, npubToHex, nsecToHex } from '@/lib/nostrRelay';
import { getConversationKey, decryptNIP44 } from '@/lib/nip44';
import { useRelaySecrets } from '@/hooks/useRelaySecrets';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useRelaySync } from '@/hooks/useRelaySync';
import { toast } from 'sonner';
import logoN from '@/assets/logo-n.png';
import AddSecretSheet from './AddSecretSheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const MAX_VISIBLE_KEYS = 4;
const SELECTOR_AUTO_CLOSE_MS = 10 * 1000;

interface KeySelectorDropdownProps {
  keys: Array<{ id: string; name: string; publicKey: string; color?: string }>;
  displayKey: { id: string; name: string; publicKey: string; color?: string } | null | undefined;
  onSelectKey: (id: string) => void;
  truncateKey: (key: string) => string;
}

const KeySelectorDropdown = ({ keys, displayKey, onSelectKey, truncateKey }: KeySelectorDropdownProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll);
    return () => el.removeEventListener('scroll', checkScroll);
  }, [checkScroll, keys.length]);

  const scrollUp = () => {
    scrollRef.current?.scrollBy({ top: -72, behavior: 'smooth' });
  };

  const scrollDown = () => {
    scrollRef.current?.scrollBy({ top: 72, behavior: 'smooth' });
  };

  if (keys.length === 0) {
    return (
      <div className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50 neon-border bg-card/80 backdrop-blur-md">
        <div className="p-4 text-center text-muted-foreground">
          No keys added
        </div>
      </div>
    );
  }

  const showScrollIndicators = keys.length > MAX_VISIBLE_KEYS;

  return (
    <div className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50 neon-border bg-card/80 backdrop-blur-md">
      {showScrollIndicators && (
        <button
          onClick={scrollUp}
          className={`w-full py-1.5 flex items-center justify-center transition-all ${
            canScrollUp ? 'opacity-100 hover:bg-primary/10' : 'opacity-30 cursor-default'
          }`}
          disabled={!canScrollUp}
        >
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      <div 
        ref={scrollRef}
        className="overflow-y-auto scrollbar-hide"
        style={{ maxHeight: `${MAX_VISIBLE_KEYS * 72}px` }}
      >
        {keys.map(key => (
          <button
            key={key.id}
            onClick={() => onSelectKey(key.id)}
            className={`w-full p-4 flex items-center gap-3 transition-colors hover:bg-primary/10 ${
              displayKey?.id === key.id ? 'bg-primary/20' : ''
            }`}
            style={{ height: '72px' }}
          >
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ 
                backgroundColor: `${key.color || KEY_COLORS[0].value}20`,
                boxShadow: `0 0 10px ${key.color || KEY_COLORS[0].value}, 0 0 20px ${key.color || KEY_COLORS[0].value}50`
              }}
            >
              <Key className="w-4 h-4" style={{ color: key.color || KEY_COLORS[0].value }} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <span className="font-medium text-foreground block truncate">{key.name}</span>
              <span className="text-xs text-muted-foreground block font-mono truncate">
                {truncateKey(key.publicKey)}
              </span>
            </div>
            {displayKey?.id === key.id && (
              <Check className="w-4 h-4 text-primary shrink-0" />
            )}
          </button>
        ))}
      </div>

      {showScrollIndicators && (
        <button
          onClick={scrollDown}
          className={`w-full py-1.5 flex items-center justify-center transition-all ${
            canScrollDown ? 'opacity-100 hover:bg-primary/10' : 'opacity-30 cursor-default'
          }`}
          disabled={!canScrollDown}
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
};

interface SecretsScreenProps {
  isActive?: boolean;
}

const SecretsScreen = ({ isActive = true }: SecretsScreenProps) => {
  const { keys, defaultKeyId, setDefaultKey, deletedSecretIds, markDeleted, unmarkDeleted, lastDecrypted, markDecrypted } = useVault();
  const { secrets, isLoading, isConnected, error, refresh, deleteSecret } = useRelaySecrets(keys);
  const { queue: offlineQueue, count: offlineCount, retryAll: retryOfflineQueue, hydrateKeys } = useOfflineQueue();
  const { needsSync, isRunning: isSyncing, syncAll } = useRelaySync(secrets, keys);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [expandedSecretId, setExpandedSecretId] = useState<string | null>(null);
  const [decryptedSecrets, setDecryptedSecrets] = useState<Record<string, string>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [deleteSecretId, setDeleteSecretId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedSearchQuery, setDeletedSearchQuery] = useState('');
  const selectorRef = useRef<HTMLDivElement>(null);
  const allTags = getStoredTags();

  // Close dropdown when clicking outside or after timeout
  useEffect(() => {
    if (!showSelector) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setShowSelector(false);
      }
    };
    
    const autoCloseTimer = setTimeout(() => {
      setShowSelector(false);
    }, SELECTOR_AUTO_CLOSE_MS);
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(autoCloseTimer);
    };
  }, [showSelector]);

  // Determine display key - use defaultKeyId as primary source of truth
  const displayKey = useMemo(() => {
    // If user selected a key in this session, use it
    if (selectedKeyId) {
      const selected = keys.find(k => k.id === selectedKeyId);
      if (selected) return selected;
    }
    // Otherwise use the default key
    if (defaultKeyId) {
      const defaultKey = keys.find(k => k.id === defaultKeyId);
      if (defaultKey) return defaultKey;
    }
    // Fallback to first key
    return keys.length > 0 ? keys[0] : null;
  }, [selectedKeyId, defaultKeyId, keys]);

  // Reset selectedKeyId when it's no longer valid
  useEffect(() => {
    if (selectedKeyId && !keys.find(k => k.id === selectedKeyId)) {
      setSelectedKeyId(null);
    }
  }, [keys, selectedKeyId]);

  // Hydrate offline queue with keys when vault is unlocked
  useEffect(() => {
    if (keys.length > 0) {
      hydrateKeys(keys);
    }
  }, [keys, hydrateKeys]);

  // Get only tags that exist in current key's secrets
  const usedTags = useMemo(() => {
    if (!displayKey) return [];
    
    const keySecrets = secrets.filter(s => s.keyId === displayKey.id);
    const usedTagIds = new Set<string>();
    
    keySecrets.forEach(secret => {
      secret.tags.forEach(tagId => usedTagIds.add(tagId));
    });
    
    return allTags.filter(tag => usedTagIds.has(tag.id));
  }, [secrets, displayKey, allTags]);

  // Filter secrets by selected key, search, tags, AND exclude deleted ones
  const filteredSecrets = useMemo(() => {
    if (!displayKey) return [];
    
    return secrets.filter(secret => {
      // Must belong to selected key
      if (secret.keyId !== displayKey.id) return false;
      
      // Exclude soft-deleted secrets from main view
      if (deletedSecretIds.includes(secret.eventId)) return false;
      
      const matchesSearch = searchQuery === '' || 
        secret.title.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTags = selectedTags.length === 0 || 
        selectedTags.some(tag => secret.tags.includes(tag));
      
      return matchesSearch && matchesTags;
    });
  }, [secrets, displayKey, searchQuery, selectedTags, deletedSecretIds]);

  // Get deleted secrets for current key (with search filter)
  const deletedSecrets = useMemo(() => {
    if (!displayKey) return [];
    
    return secrets.filter(secret => {
      if (secret.keyId !== displayKey.id) return false;
      if (!deletedSecretIds.includes(secret.eventId)) return false;
      
      // Apply search filter
      if (deletedSearchQuery) {
        return secret.title.toLowerCase().includes(deletedSearchQuery.toLowerCase());
      }
      return true;
    });
  }, [secrets, displayKey, deletedSecretIds, deletedSearchQuery]);

  // Total deleted count (before search filter)
  const totalDeletedCount = useMemo(() => {
    if (!displayKey) return 0;
    return secrets.filter(s => s.keyId === displayKey.id && deletedSecretIds.includes(s.eventId)).length;
  }, [secrets, displayKey, deletedSecretIds]);

  const handleSelectKey = (id: string) => {
    setSelectedKeyId(id);
    setShowSelector(false);
  };

  const handleCopyKey = (pubkey: string) => {
    navigator.clipboard.writeText(pubkey);
    toast.success('Key copied to clipboard');
  };

  const truncateKey = useCallback((key: string) => {
    if (key.length > 16) {
      return key.slice(0, 8) + '...' + key.slice(-8);
    }
    return key;
  }, []);

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
    );
  };

  const handleDecrypt = useCallback(async (secret: { id: string; keyId: string; encryptedContent: string; encryptionVersion?: number }) => {
    const key = keys.find(k => k.id === secret.keyId);
    if (!key) {
      toast.error('Key not found');
      return;
    }

    try {
      const pubkeyHex = npubToHex(key.publicKey);
      const privHex = nsecToHex(key.privateKey);
      
      let decrypted: string | null = null;
      
      // Use hybrid decryption based on version
      if (secret.encryptionVersion === 2) {
        // NIP-44 v2 (ChaCha20 + HMAC-SHA256)
        try {
          const conversationKey = getConversationKey(privHex, pubkeyHex);
          decrypted = decryptNIP44(secret.encryptedContent, conversationKey);
        } catch (e) {
          console.error('NIP-44 decrypt error:', e);
          decrypted = null;
        }
      } else {
        // NIP-04 (AES-256-CBC) - legacy
        decrypted = await decryptNIP04(
          secret.encryptedContent,
          key.privateKey,
          pubkeyHex
        );
      }

      if (decrypted) {
        setDecryptedSecrets(prev => ({ ...prev, [secret.id]: decrypted }));
        // Track last decrypted time
        markDecrypted(secret.id);
        toast.success('Secret decrypted');
      } else {
        toast.error('Failed to decrypt');
      }
    } catch (e) {
      console.error('Decrypt error:', e);
      toast.error('Decryption failed');
    }
  }, [keys, markDecrypted]);

  const handleHide = (secretId: string) => {
    setDecryptedSecrets(prev => {
      const next = { ...prev };
      delete next[secretId];
      return next;
    });
  };

  const handleCopy = async (text: string, fieldId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
    toast.success('Copied to clipboard');
  };

  const handleDelete = async () => {
    if (!deleteSecretId) return;
    
    const secret = secrets.find(s => s.id === deleteSecretId);
    if (!secret) {
      setDeleteSecretId(null);
      return;
    }

    const key = keys.find(k => k.id === secret.keyId);
    if (!key) {
      toast.error('Key not found - cannot delete from relay');
      setDeleteSecretId(null);
      return;
    }

    setIsDeleting(true);
    
    try {
      // Try to delete from relay (NIP-09)
      const success = await deleteSecret(secret.eventId, key);
      
      // Always mark as soft-deleted locally (now in encrypted vault)
      await markDeleted(secret.eventId);
      
      if (success) {
        toast.success('Secret deleted from relay');
      } else {
        toast.success('Secret marked as deleted', {
          description: 'Relay deletion failed, but hidden locally'
        });
      }
    } catch (e) {
      console.error('Delete error:', e);
      // Still soft-delete locally
      await markDeleted(secret.eventId);
      toast.success('Secret marked as deleted locally');
    } finally {
      setIsDeleting(false);
      setDeleteSecretId(null);
    }
  };

  const handleRestore = async (eventId: string) => {
    await unmarkDeleted(eventId);
    toast.success('Secret restored');
  };

  const handleRefresh = async () => {
    await refresh();
    toast.success('Secrets refreshed');
  };

  const getTagColor = (tagId: string): string => {
    const tag = allTags.find(t => t.id === tagId);
    return tag?.color || 'hsl(var(--muted))';
  };

  const getTagName = (tagId: string): string => {
    const tag = allTags.find(t => t.id === tagId);
    return tag?.name || tagId;
  };

  // Count excludes deleted secrets
  const secretsCount = displayKey ? secrets.filter(s => s.keyId === displayKey.id && !deletedSecretIds.includes(s.eventId)).length : 0;

  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header */}
      <div className="shrink-0 bg-background/80 backdrop-blur-sm p-4 pb-0 pt-10 z-10">
        <div className="flex items-center gap-3 mb-4">
          <img src={logoN} alt="Logo" className="w-10 h-10 rounded-full neon-glow" />
          <h1 className="text-xl font-bold text-foreground">
            Nostr <span className="text-primary">Secrets</span>
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {/* Sync indicator - secrets not on all relays */}
            {needsSync > 0 && !isSyncing && (
              <button
                onClick={() => syncAll()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors"
                title={`${needsSync} secret(s) not on all relays`}
              >
                <CloudUpload className="w-3.5 h-3.5" />
                {needsSync}
              </button>
            )}
            {isSyncing && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/20 text-primary text-xs font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Syncing...
              </div>
            )}
            {/* Offline queue indicator */}
            {offlineCount > 0 && (
              <button
                onClick={() => {
                  retryOfflineQueue();
                  toast.info(`Retrying ${offlineCount} pending save(s)...`);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-warning/20 text-warning text-xs font-medium hover:bg-warning/30 transition-colors"
              >
                <CloudOff className="w-3.5 h-3.5" />
                {offlineCount}
              </button>
            )}
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            ) : !isConnected && keys.length > 0 ? (
              <WifiOff className="w-4 h-4 text-destructive" />
            ) : null}
            <button
              onClick={handleRefresh}
              disabled={isLoading || keys.length === 0}
              className="p-2 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 pb-4">
        {/* Key Selector */}
        <div className="relative mb-4" ref={selectorRef}>
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="w-full glass-card rounded-xl p-4 flex items-center gap-3 neon-border transition-all hover:bg-card/80"
          >
            <div 
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ 
                backgroundColor: `${displayKey?.color || KEY_COLORS[0].value}20`,
                boxShadow: `0 0 20px ${displayKey?.color || KEY_COLORS[0].value}40, 0 0 40px ${displayKey?.color || KEY_COLORS[0].value}20`
              }}
            >
              <Key className="w-7 h-7" style={{ color: displayKey?.color || KEY_COLORS[0].value }} />
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {displayKey?.name || 'Select a key'}
                </span>
                {displayKey && <Check className="w-4 h-4" style={{ color: 'hsl(160, 100%, 50%)' }} />}
                {secretsCount > 0 && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                    {secretsCount} secret{secretsCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {displayKey && (
                <span 
                  className="text-sm text-muted-foreground font-mono cursor-pointer hover:text-primary transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyKey(displayKey.publicKey);
                  }}
                >
                  #{truncateKey(displayKey.publicKey)}
                  <Copy className="w-3 h-3 inline ml-1" />
                </span>
              )}
            </div>
            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${showSelector ? 'rotate-180' : 'rotate-0'}`} />
          </button>

          {showSelector && (
            <KeySelectorDropdown 
              keys={keys}
              displayKey={displayKey}
              onSelectKey={handleSelectKey}
              truncateKey={truncateKey}
            />
          )}
        </div>

        {/* Connection Error */}
        {error && keys.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-destructive shrink-0" />
            <span className="text-sm text-destructive">{error}</span>
            <button
              onClick={handleRefresh}
              className="ml-auto text-xs text-destructive hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search secrets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-card/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {searchQuery ? (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          ) : (
            <button
              onClick={() => setShowAddSheet(true)}
              disabled={keys.length === 0}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tag Filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3">
          {usedTags.map(tag => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                selectedTags.includes(tag.id)
                  ? 'bg-primary/20 text-primary border border-primary/50'
                  : 'bg-card/50 text-muted-foreground border border-border hover:border-primary/30'
              }`}
            >
              <Tag className="w-3 h-3" />
              {tag.name}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {isLoading && secrets.length === 0 ? (
          <div className="text-center py-12">
            <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Loading secrets from relays...</p>
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-12">
            <Key className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Add a key first</p>
            <p className="text-xs text-muted-foreground mt-2">Keys are required to encrypt secrets</p>
          </div>
        ) : filteredSecrets.length === 0 ? (
          <div className="text-center py-12">
            <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">
              {secretsCount === 0 ? 'No secrets on relay' : 'No matching secrets'}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {secretsCount === 0 ? 'Tap + to add your first secret' : 'Try a different search or filter'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSecrets.map((secret, index) => {
              const isDecrypted = !!decryptedSecrets[secret.id];
              const decryptedContent = decryptedSecrets[secret.id];
              const isExpanded = expandedSecretId === secret.id;
              const lastDecryptedTime = lastDecrypted[secret.id];

              // Format relative time
              const formatRelativeTime = (timestamp: number): string => {
                const now = Date.now();
                const diff = now - timestamp;
                const minutes = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);
                
                if (minutes < 1) return 'just now';
                if (minutes < 60) return `${minutes}m ago`;
                if (hours < 24) return `${hours}h ago`;
                if (days < 7) return `${days}d ago`;
                return new Date(timestamp).toLocaleDateString();
              };

              return (
                <div
                  key={secret.id}
                  className="glass-card rounded-xl neon-border overflow-hidden transition-all"
                  style={{
                    animationDelay: `${index * 50}ms`,
                    animation: 'fadeIn 0.3s ease-out forwards',
                    opacity: 0,
                  }}
                >
                  {/* Card Header */}
                  <button
                    onClick={() => setExpandedSecretId(isExpanded ? null : secret.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground truncate">{secret.title}</h3>
                          <span className="text-[10px] text-primary flex items-center gap-0.5 shrink-0">
                            <Radio className="w-3 h-3" />
                            {secret.relays.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {secret.tags.slice(0, 2).map(tagId => (
                            <span
                              key={tagId}
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ 
                                backgroundColor: `${getTagColor(tagId)}20`,
                                color: getTagColor(tagId)
                              }}
                            >
                              {getTagName(tagId)}
                            </span>
                          ))}
                          {secret.tags.length > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{secret.tags.length - 2}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-foreground/60 font-light mt-1">
                          {lastDecryptedTime 
                            ? `Last opened ${formatRelativeTime(lastDecryptedTime)}`
                            : `Created ${formatRelativeTime(secret.createdAt.getTime())}`
                          }
                        </p>
                      </div>
                      <div className="flex flex-col items-center gap-1 shrink-0 ml-3">
                        <Lock className="w-5 h-5 text-muted-foreground" />
                        <span 
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                            secret.encryptionVersion === 2 
                              ? 'bg-primary/20 text-primary' 
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          NIP-{secret.encryptionVersion === 2 ? '44' : '04'}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-border/50">
                      <div className="mt-3 p-3 rounded-lg bg-background/50 border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground">
                            {isDecrypted ? 'Content' : 'Encrypted'}
                          </span>
                          <div className="flex gap-1">
                            {isDecrypted ? (
                              <>
                                <button
                                  onClick={() => handleCopy(decryptedContent, `copy-${secret.id}`)}
                                  className="p-1.5 hover:bg-primary/20 rounded-lg transition-colors"
                                >
                                  {copiedField === `copy-${secret.id}` ? (
                                    <Check className="w-4 h-4 text-primary" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleHide(secret.id)}
                                  className="p-1.5 hover:bg-primary/20 rounded-lg transition-colors"
                                >
                                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleDecrypt(secret)}
                                className="p-1.5 hover:bg-primary/20 rounded-lg transition-colors"
                              >
                                <Eye className="w-4 h-4 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-mono text-foreground break-all">
                          {isDecrypted 
                            ? decryptedContent 
                            : secret.encryptedContent.slice(0, 50) + '...'
                          }
                        </p>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => setDeleteSecretId(secret.id)}
                          className="flex items-center gap-2 px-3 py-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-sm"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Deleted Secrets Section */}
        {totalDeletedCount > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowDeleted(!showDeleted)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
            >
              <Archive className="w-4 h-4" />
              <span>Deleted ({totalDeletedCount})</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showDeleted ? 'rotate-180' : ''}`} />
            </button>
            
            {showDeleted && (
              <div className="space-y-3">
                {/* Search in deleted */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search deleted..."
                    value={deletedSearchQuery}
                    onChange={(e) => setDeletedSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 rounded-lg bg-card/30 border border-border/50 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  {deletedSearchQuery && (
                    <button 
                      onClick={() => setDeletedSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>

                {/* Deleted items list */}
                {deletedSecrets.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No matching deleted secrets
                  </p>
                ) : (
                  <div className="space-y-2">
                    {deletedSecrets.map((secret) => (
                      <div
                        key={secret.id}
                        className="glass-card rounded-xl border border-border/30 overflow-hidden opacity-60"
                      >
                        <div className="p-3 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-foreground truncate text-sm line-through">
                              {secret.title}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Marked as deleted
                            </p>
                          </div>
                          <button
                            onClick={() => handleRestore(secret.eventId)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors text-xs"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restore
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Secret Sheet */}
      <AddSecretSheet 
        open={showAddSheet} 
        onOpenChange={setShowAddSheet}
        defaultKeyId={displayKey?.id}
        onSecretSaved={refresh}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSecretId} onOpenChange={() => !isDeleting && setDeleteSecretId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Secret</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this secret? This will send a deletion request to all relays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SecretsScreen;
