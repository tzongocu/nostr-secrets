import { useState, useEffect, useCallback } from 'react';
import { X, Tag, Plus, Key, Lock, Check, Loader2, Wand2 } from 'lucide-react';
import { useVault } from '@/context/VaultContext';
import { getStoredTags, addTag as addTagToStore, TAG_COLORS, type Tag as TagType } from '@/lib/secretStore';
import { npubToHex, sendDM, nsecToHex } from '@/lib/nostrRelay';
import { getConversationKey, encryptNIP44 } from '@/lib/nip44';
import { KEY_COLORS, type NostrKey } from '@/lib/keyStore';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';

interface AddSecretSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKeyId?: string;
  onSecretSaved?: () => void;
}

const AddSecretSheet = ({ open, onOpenChange, defaultKeyId, onSecretSaved }: AddSecretSheetProps) => {
  const { keys } = useVault();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>(defaultKeyId || '');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0].value);
  const [tags, setTags] = useState<TagType[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Password generator state
  const [passwordLength, setPasswordLength] = useState(16);
  const [useUppercase, setUseUppercase] = useState(true);
  const [useLowercase, setUseLowercase] = useState(true);
  const [useNumbers, setUseNumbers] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);

  const generatePassword = useCallback(() => {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    let chars = '';
    if (useUppercase) chars += uppercase;
    if (useLowercase) chars += lowercase;
    if (useNumbers) chars += numbers;
    if (useSymbols) chars += symbols;
    
    if (chars.length === 0) {
      toast.error('Select at least one character type');
      return;
    }
    
    let password = '';
    const array = new Uint32Array(passwordLength);
    crypto.getRandomValues(array);
    
    for (let i = 0; i < passwordLength; i++) {
      password += chars[array[i] % chars.length];
    }
    
    setContent(password);
    toast.success('Password generated');
  }, [passwordLength, useUppercase, useLowercase, useNumbers, useSymbols]);

  // Load tags
  useEffect(() => {
    setTags(getStoredTags());
  }, [open]);

  // Set default key
  useEffect(() => {
    if (defaultKeyId && !selectedKeyId) {
      setSelectedKeyId(defaultKeyId);
    } else if (keys.length > 0 && !selectedKeyId) {
      setSelectedKeyId(keys[0].id);
    }
  }, [defaultKeyId, keys, selectedKeyId]);

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
    );
  };

  const handleAddTag = () => {
    if (!newTagName.trim()) return;
    
    const newTag = addTagToStore(newTagName.trim(), newTagColor);
    setTags(prev => [...prev, newTag]);
    setSelectedTags(prev => [...prev, newTag.id]);
    setNewTagName('');
    setShowNewTagInput(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!content.trim()) {
      toast.error('Secret content is required');
      return;
    }
    if (!selectedKeyId) {
      toast.error('Select a key');
      return;
    }

    const key = keys.find(k => k.id === selectedKeyId);
    if (!key) {
      toast.error('Key not found');
      return;
    }

    setIsSaving(true);

    try {
      // Encrypt content using NIP-44 v2 (ChaCha20 + HMAC-SHA256)
      const pubkeyHex = npubToHex(key.publicKey);
      const privHex = nsecToHex(key.privateKey);
      
      let encrypted: string;
      try {
        const conversationKey = getConversationKey(privHex, pubkeyHex);
        encrypted = encryptNIP44(content, conversationKey);
      } catch (e) {
        console.error('NIP-44 encryption failed:', e);
        toast.error('Encryption failed');
        setIsSaving(false);
        return;
      }

      // Create DM content with secret metadata (version 2 = NIP-44)
      const dmContent = JSON.stringify({
        type: 'nostr-secret',
        version: 2,
        title: title.trim(),
        tags: selectedTags,
        content: encrypted,
      });

      // Send to relay - MUST succeed for save to complete
      const success = await sendDM(key, pubkeyHex, dmContent);
      
      if (!success) {
        toast.error('Cannot save - no relay connection');
        setIsSaving(false);
        return;
      }

      toast.success('Secret saved to relay');

      // Reset form
      setTitle('');
      setContent('');
      setSelectedTags([]);
      onOpenChange(false);
      
      // Trigger refresh
      onSecretSaved?.();
    } catch (e) {
      console.error('Save error:', e);
      toast.error('Failed to save secret');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedKey = keys.find(k => k.id === selectedKeyId);
  const keyColor = selectedKey?.color || KEY_COLORS[0].value;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl px-0 sm:max-w-md sm:mx-auto sm:left-0 sm:right-0">
        <div className="max-w-md mx-auto px-6 h-full flex flex-col">
          <SheetHeader className="pb-4 shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Add Secret
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 overflow-y-auto pb-24 flex-1">
          {/* Title */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Gmail Password, Bitcoin Seed..."
              className="bg-card/50"
            />
          </div>

          {/* Secret Content */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Secret Content</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your secret..."
              className="bg-card/50 min-h-[120px]"
            />
            
            {/* Password Generator */}
            <div className="mt-3 p-3 rounded-xl bg-card/30 border border-border/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground font-medium">Password Generator</span>
                <button
                  type="button"
                  onClick={generatePassword}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Generate
                </button>
              </div>
              
              {/* Length slider */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Length</span>
                  <span className="text-xs font-mono text-foreground bg-card/50 px-2 py-0.5 rounded">{passwordLength}</span>
                </div>
                <Slider
                  value={[passwordLength]}
                  onValueChange={(v) => setPasswordLength(v[0])}
                  min={8}
                  max={64}
                  step={1}
                  className="w-full"
                />
              </div>
              
              {/* Character options */}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <Checkbox 
                    checked={useUppercase} 
                    onCheckedChange={(c) => setUseUppercase(c === true)}
                  />
                  ABC (uppercase)
                </label>
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <Checkbox 
                    checked={useLowercase} 
                    onCheckedChange={(c) => setUseLowercase(c === true)}
                  />
                  abc (lowercase)
                </label>
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <Checkbox 
                    checked={useNumbers} 
                    onCheckedChange={(c) => setUseNumbers(c === true)}
                  />
                  123 (numbers)
                </label>
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <Checkbox 
                    checked={useSymbols} 
                    onCheckedChange={(c) => setUseSymbols(c === true)}
                  />
                  !@# (symbols)
                </label>
              </div>
            </div>
          </div>

          {/* Key Selector */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Encrypt with Key</label>
            <div className="grid grid-cols-2 gap-2">
              {keys.map(key => (
                <button
                  key={key.id}
                  onClick={() => setSelectedKeyId(key.id)}
                  className={`p-3 rounded-xl flex items-center gap-2 transition-all ${
                    selectedKeyId === key.id
                      ? 'bg-primary/20 border border-primary/50'
                      : 'bg-card/50 border border-border hover:border-primary/30'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${key.color || KEY_COLORS[0].value}20`,
                    }}
                  >
                    <Key className="w-4 h-4" style={{ color: key.color || KEY_COLORS[0].value }} />
                  </div>
                  <span className="text-sm font-medium text-foreground truncate">{key.name}</span>
                  {selectedKeyId === key.id && (
                    <Check className="w-4 h-4 text-primary ml-auto shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Tags</label>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedTags.includes(tag.id)
                      ? 'border'
                      : 'bg-card/50 border border-border hover:border-primary/30'
                  }`}
                  style={selectedTags.includes(tag.id) ? {
                    backgroundColor: `${tag.color}20`,
                    borderColor: `${tag.color}80`,
                    color: tag.color,
                  } : undefined}
                >
                  <Tag className="w-3 h-3" />
                  {tag.name}
                </button>
              ))}
              
              {/* Add new tag */}
              {showNewTagInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Tag name"
                    className="h-8 w-24 text-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTag();
                      if (e.key === 'Escape') setShowNewTagInput(false);
                    }}
                  />
                  <div className="flex gap-1">
                    {TAG_COLORS.slice(0, 4).map(c => (
                      <button
                        key={c.value}
                        onClick={() => setNewTagColor(c.value)}
                        className={`w-5 h-5 rounded-full ${newTagColor === c.value ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background' : ''}`}
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleAddTag}
                    className="p-1.5 bg-primary text-primary-foreground rounded-lg"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setShowNewTagInput(false)}
                    className="p-1.5 hover:bg-card/80 rounded-lg"
                  >
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewTagInput(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-muted-foreground bg-card/50 border border-dashed border-border hover:border-primary/30 transition-all"
                >
                  <Plus className="w-3 h-3" />
                  New Tag
                </button>
              )}
            </div>
          </div>

          </div>

          {/* Save Button - Fixed at bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
            <div className="max-w-md mx-auto">
              <button
                onClick={handleSave}
                disabled={isSaving || !title.trim() || !content.trim()}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium neon-glow transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving to relay...
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    Save Secret
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AddSecretSheet;
