import { useState } from 'react';
import { Trash2, Settings, Shield, Radio } from 'lucide-react';
import { APP_NAME, APP_VERSION } from '@/lib/constants';
import { useVault } from '@/context/VaultContext';
import RelayManager from '@/components/RelayManager';
import SecuritySheet from '@/components/SecuritySheet';
import { toast } from 'sonner';
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

interface SettingsScreenProps {
  onLogout: () => void;
  onEnablePin: () => void;
}

const SettingsScreen = ({ onLogout, onEnablePin }: SettingsScreenProps) => {
  const { resetVault, pinEnabled } = useVault();
  const [showClearDataDialog, setShowClearDataDialog] = useState(false);
  const [showRelayManager, setShowRelayManager] = useState(false);
  const [showSecuritySheet, setShowSecuritySheet] = useState(false);

  const handleClearData = () => {
    resetVault();
    setShowClearDataDialog(false);
    toast.success('All data deleted');
    window.location.reload();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Fixed Header */}
      <div className="shrink-0 bg-background/80 backdrop-blur-sm p-4 pb-2 pt-10 z-10">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          Settings
        </h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 pb-4">
        <div className="space-y-3">
          {/* Security */}
          <button
            onClick={() => setShowSecuritySheet(true)}
            className="w-full glass-card rounded-xl p-4 neon-border flex items-center gap-3 transition-all hover:bg-card/80"
          >
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-foreground">Security</p>
              <p className="text-xs text-muted-foreground">
                {pinEnabled ? 'PIN enabled • Encrypted' : 'PIN disabled • Unencrypted'}
              </p>
            </div>
          </button>

          {/* Relay Manager */}
          <button
            onClick={() => setShowRelayManager(true)}
            className="w-full glass-card rounded-xl p-4 neon-border flex items-center gap-3 transition-all hover:bg-card/80"
          >
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
              <Radio className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-foreground">Manage Relays</p>
              <p className="text-xs text-muted-foreground">Sync secrets to Nostr relays</p>
            </div>
          </button>

          {/* Clear Data */}
          <button
            onClick={() => setShowClearDataDialog(true)}
            className="w-full glass-card rounded-xl p-4 border border-destructive/30 flex items-center gap-3 transition-all hover:bg-destructive/10"
          >
            <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-destructive">Delete All Data</p>
              <p className="text-xs text-muted-foreground">Completely reset the app</p>
            </div>
          </button>
        </div>

        {/* App Info */}
        <div className="mt-auto pt-4 pb-2">
          <div className="text-right opacity-40">
            <p className="text-xs text-muted-foreground">{APP_NAME} v{APP_VERSION}</p>
            <p className="text-xs text-muted-foreground">{pinEnabled ? 'Encrypted' : 'Unencrypted'} Storage</p>
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Open Source on GitHub
            </a>
          </div>
        </div>
      </div>

      {/* Clear Data Dialog */}
      <AlertDialog open={showClearDataDialog} onOpenChange={setShowClearDataDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Data</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong className="text-destructive">⚠️ Warning:</strong> This will permanently delete ALL your data including:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All your Nostr keys (public and private)</li>
                <li>All your encrypted secrets</li>
                <li>PIN settings and preferences</li>
              </ul>
              <p className="font-semibold">
                Your keys and secrets cannot be recovered after deletion! Make sure you have backed up your private keys (nsec) before proceeding.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Security Sheet */}
      <SecuritySheet 
        open={showSecuritySheet}
        onOpenChange={setShowSecuritySheet}
        onEnablePin={onEnablePin}
        onLock={onLogout}
      />

      {/* Relay Manager Modal */}
      {showRelayManager && (
        <RelayManager onClose={() => setShowRelayManager(false)} />
      )}
    </div>
  );
};

export default SettingsScreen;
