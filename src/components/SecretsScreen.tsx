import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Lock, Plus, Search, Tag, Eye, EyeOff, Copy, Check, Trash2, X, Key, ChevronDown, ChevronUp } from 'lucide-react';
import { useVault } from '@/context/VaultContext';
import { getStoredTags, type Secret, type Tag as TagType } from '@/lib/secretStore';
import { KEY_COLORS } from '@/lib/keyStore';
import { decryptNIP04, npubToHex } from '@/lib/nostrRelay';
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
  const { keys, secrets, removeSecret, defaultKeyId, setDefaultKey } = useVault();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [expandedSecretId, setExpandedSecretId] = useState<string | null>(null);
  const [decryptedSecrets, setDecryptedSecrets] = useState<Record<string, string>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [deleteSecretId, setDeleteSecretId] = useState<string | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const selectorRef = useRef<HTMLDivElement>(null);

  const tags = getStoredTags();

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

  // Determine display key
  const displayKey = useMemo(() => {
    if (selectedKeyId) return keys.find(k => k.id === selectedKeyId);
    if (defaultKeyId) return keys.find(k => k.id === defaultKeyId);
    return keys.length > 0 ? keys[0] : null;
  }, [selectedKeyId, defaultKeyId, keys]);

  // Filter secrets by selected key, search, and tags
  const filteredSecrets = useMemo(() => {
    if (!displayKey) return [];
    
    return secrets.filter(secret => {
      // Must belong to selected key
      if (secret.keyId !== displayKey.id) return false;
      
      const matchesSearch = searchQuery === '' || 
        secret.title.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTags = selectedTags.length === 0 || 
        selectedTags.some(tag => secret.tags.includes(tag));
      
      return matchesSearch && matchesTags;
    });
  }, [secrets, displayKey, searchQuery, selectedTags]);

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

  const handleDecrypt = useCallback(async (secret: Secret) => {
    const key = keys.find(k => k.id === secret.keyId);
    if (!key) {
      toast.error('Key not found');
      return;
    }

    try {
      const pubkeyHex = npubToHex(key.publicKey);
      
      const decrypted = await decryptNIP04(
        secret.encryptedContent,
        key.privateKey,
        pubkeyHex
      );

      if (decrypted) {
        setDecryptedSecrets(prev => ({ ...prev, [secret.id]: decrypted }));
        toast.success('Secret decrypted');
      } else {
        toast.error('Failed to decrypt');
      }
    } catch (e) {
      console.error('Decrypt error:', e);
      toast.error('Decryption failed');
    }
  }, [keys]);

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
    await removeSecret(deleteSecretId);
    setDeleteSecretId(null);
    toast.success('Secret deleted');
  };

  const getTagColor = (tagId: string): string => {
    const tag = tags.find(t => t.id === tagId);
    return tag?.color || 'hsl(var(--muted))';
  };

  const getTagName = (tagId: string): string => {
    const tag = tags.find(t => t.id === tagId);
    return tag?.name || tagId;
  };

  const secretsCount = displayKey ? secrets.filter(s => s.keyId === displayKey.id).length : 0;

  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header */}
      <div className="shrink-0 bg-background/80 backdrop-blur-sm p-4 pb-0 pt-10 z-10">
        <div className="flex items-center gap-3 mb-4">
          <img src={logoN} alt="Logo" className="w-10 h-10 rounded-full neon-glow" />
          <h1 className="text-xl font-bold text-foreground">
            Nostr <span className="text-primary">Secrets</span>
          </h1>
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
          {tags.map(tag => (
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

        {/* Secrets List */}
        {keys.length === 0 ? (
          <div className="text-center py-12">
            <Key className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Add a key first</p>
            <p className="text-xs text-muted-foreground mt-2">Keys are required to encrypt secrets</p>
          </div>
        ) : filteredSecrets.length === 0 ? (
          <div className="text-center py-12">
            <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">
              {secretsCount === 0 ? 'No secrets yet' : 'No matching secrets'}
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
                        <h3 className="font-semibold text-foreground truncate">{secret.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
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
                      </div>
                      <Lock className="w-5 h-5 text-muted-foreground shrink-0 ml-3" />
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
      </div>

      {/* Add Secret Sheet */}
      <AddSecretSheet 
        open={showAddSheet} 
        onOpenChange={setShowAddSheet}
        defaultKeyId={displayKey?.id}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSecretId} onOpenChange={() => setDeleteSecretId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Secret</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this secret? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SecretsScreen;
