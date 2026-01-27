import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Lock, ShieldCheck, ShieldOff, Fingerprint } from 'lucide-react';
import { useVault } from '@/context/VaultContext';
import PinScreen from '@/components/PinScreen';
import Portal from './Portal';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  checkBiometricAvailability,
  isBiometricsEnabled,
  registerBiometric,
  disableBiometrics,
} from '@/hooks/useBiometrics';

interface SecuritySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnablePin: () => void;
  onLock: () => void;
}

const SecuritySheet = ({ open, onOpenChange, onEnablePin, onLock }: SecuritySheetProps) => {
  const { pinEnabled, currentPin } = useVault();
  const [showDisablePinScreen, setShowDisablePinScreen] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [biometricsOn, setBiometricsOn] = useState(isBiometricsEnabled());
  const isNative = Capacitor.isNativePlatform();

  // Sync biometrics state with PIN state
  useEffect(() => {
    if (!pinEnabled) {
      setBiometricsOn(false);
    } else {
      setBiometricsOn(isBiometricsEnabled());
    }
  }, [pinEnabled]);

  useEffect(() => {
    if (!open) return;
    
    let cancelled = false;

    const refresh = async () => {
      const available = await checkBiometricAvailability();
      if (!cancelled) setBiometricsAvailable(available);

      // Small retry for native init timing (can happen right after app start)
      if (!available) {
        for (const delayMs of [400, 1200]) {
          await new Promise((r) => setTimeout(r, delayMs));
          const retry = await checkBiometricAvailability();
          if (!cancelled) setBiometricsAvailable(retry);
          if (retry) break;
        }
      }
    };

    refresh();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleToggleBiometrics = async () => {
    if (biometricsOn) {
      await disableBiometrics();
      setBiometricsOn(false);
      toast.success('Biometrics disabled');
    } else {
      if (!currentPin) {
        toast.error('PIN not available');
        return;
      }
      const success = await registerBiometric(currentPin);
      if (success) {
        setBiometricsOn(true);
        toast.success('Biometrics enabled');
      } else {
        toast.error('Failed to enable biometrics');
      }
    }
  };

  const handleTogglePin = () => {
    if (pinEnabled) {
      setShowDisablePinScreen(true);
    } else {
      onOpenChange(false);
      onEnablePin();
    }
  };

  const handleDisablePinSuccess = () => {
    setShowDisablePinScreen(false);
    toast.success('PIN disabled');
  };

  const handleLock = () => {
    onOpenChange(false);
    onLock();
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
        <DrawerContent direction="right" className="p-0 overflow-hidden" showHandle={true}>
          <div className="h-full flex flex-col pl-4">
            {/* Header */}
            <DrawerHeader className="shrink-0 p-4 pl-0 pb-2 pt-10 border-b border-border/50">
              <DrawerTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Security
              </DrawerTitle>
            </DrawerHeader>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
              <div className="space-y-3">
                {/* PIN Protection Toggle */}
                <div className="w-full glass-card rounded-xl p-4 neon-border flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    {pinEnabled ? (
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    ) : (
                      <ShieldOff className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">PIN Protection</p>
                    <p className="text-xs text-muted-foreground">
                      {pinEnabled ? 'Data is encrypted' : 'Data is not encrypted'}
                    </p>
                  </div>
                  <Switch
                    checked={pinEnabled}
                    onCheckedChange={handleTogglePin}
                  />
                </div>

                {/* Biometrics - only show when PIN is enabled */}
                {pinEnabled && biometricsAvailable ? (
                  <div className="w-full glass-card rounded-xl p-4 neon-border flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Fingerprint className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Biometrics</p>
                      <p className="text-xs text-muted-foreground">
                        {biometricsOn ? 'Fingerprint / Face ID enabled' : 'Use fingerprint or Face ID'}
                      </p>
                    </div>
                    <Switch checked={biometricsOn} onCheckedChange={handleToggleBiometrics} />
                  </div>
                ) : pinEnabled && !isNative ? (
                  <div className="w-full glass-card rounded-xl p-4 neon-border flex items-center gap-3 opacity-70">
                    <div className="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center">
                      <Fingerprint className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Biometrics</p>
                      <p className="text-xs text-muted-foreground">Available only in the Android app (APK)</p>
                    </div>
                    <Switch checked={false} disabled />
                  </div>
                ) : null}

                {/* Lock App - only show when PIN is enabled */}
                {pinEnabled && (
                  <button
                    onClick={handleLock}
                    className="w-full glass-card rounded-xl p-4 neon-border flex items-center gap-3 transition-all hover:bg-card/80"
                  >
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-accent" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-foreground">Lock App</p>
                      <p className="text-xs text-muted-foreground">Return to PIN screen</p>
                    </div>
                  </button>
                )}

                {/* Status info */}
                <div className="mt-6 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground text-center">
                    {pinEnabled 
                      ? '🔒 Your vault is encrypted with AES-256-GCM'
                      : '🔓 Enable PIN to encrypt your data'}
                  </p>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div className="shrink-0 p-4 border-t border-border/50">
              <button
                onClick={() => onOpenChange(false)}
                className="w-full glass-card rounded-xl p-4 neon-border flex items-center justify-center gap-2 transition-all hover:bg-card/80"
              >
                <span className="font-medium text-foreground">Close Security</span>
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Disable PIN Screen */}
      {showDisablePinScreen && (
        <Portal>
          <div className="fixed inset-0 z-[60] bg-background">
            <PinScreen 
              isSetup={false}
              isDisable={true}
              onCancel={() => setShowDisablePinScreen(false)}
              onSuccess={handleDisablePinSuccess}
            />
          </div>
        </Portal>
      )}
    </>
  );
};

export default SecuritySheet;
