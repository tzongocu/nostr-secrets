import { useState, useMemo, useCallback } from 'react';
import { Lock, Plus, Search, Tag, Eye, EyeOff, Copy, Check, Trash2, X } from 'lucide-react';
import { useVault } from '@/context/VaultContext';
import { getStoredTags, type Secret, type Tag as TagType } from '@/lib/secretStore';
import { KEY_COLORS } from '@/lib/keyStore';
import { decryptNIP04 } from '@/lib/nostrRelay';
import { toast } from 'sonner';
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

interface SecretsScreenProps {
  isActive?: boolean;
}

const SecretsScreen = ({ isActive = true }: SecretsScreenProps) => {
  const { keys, secrets, removeSecret, defaultKeyId } = useVault();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [expandedSecretId, setExpandedSecretId] = useState<string | null>(null);
  const [decryptedSecrets, setDecryptedSecrets] = useState<Record<string, string>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [deleteSecretId, setDeleteSecretId] = useState<string | null>(null);

  const tags = getStoredTags();

  // Filter secrets by search and tags
  const filteredSecrets = useMemo(() => {
    return secrets.filter(secret => {
      const matchesSearch = searchQuery === '' || 
        secret.title.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTags = selectedTags.length === 0 || 
        selectedTags.some(tag => secret.tags.includes(tag));
      
      return matchesSearch && matchesTags;
    });
  }, [secrets, searchQuery, selectedTags]);

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
      // For self-addressed DMs, the sender is the same as recipient
      const { npubToHex } = await import('@/lib/nostrRelay');
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

  const getKeyColor = (keyId: string): string => {
    const key = keys.find(k => k.id === keyId);
    return key?.color || KEY_COLORS[0].value;
  };

  const displayKey = keys.find(k => k.id === defaultKeyId) || keys[0];

  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header */}
      <div className="shrink-0 bg-background/80 backdrop-blur-sm p-4 pb-2 pt-10 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Lock className="w-6 h-6 text-primary" />
            My Secrets
          </h2>
          <button
            onClick={() => setShowAddSheet(true)}
            disabled={keys.length === 0}
            className="p-3 rounded-xl bg-primary text-primary-foreground neon-glow transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search secrets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Tag Filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
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
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 pb-4">
        {keys.length === 0 ? (
          <div className="text-center py-12">
            <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Add a key first</p>
            <p className="text-xs text-muted-foreground mt-2">Keys are required to encrypt secrets</p>
          </div>
        ) : filteredSecrets.length === 0 ? (
          <div className="text-center py-12">
            <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">
              {secrets.length === 0 ? 'No secrets yet' : 'No matching secrets'}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {secrets.length === 0 ? 'Tap + to add your first secret' : 'Try a different search or filter'}
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
                  {/* Card Header - Always visible */}
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
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ml-3"
                        style={{ 
                          backgroundColor: `${getKeyColor(secret.keyId)}20`,
                        }}
                      >
                        <Lock className="w-4 h-4" style={{ color: getKeyColor(secret.keyId) }} />
                      </div>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-border/50">
                      {/* Encrypted/Decrypted Content */}
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

                      {/* Actions */}
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
