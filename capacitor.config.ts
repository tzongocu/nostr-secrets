import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nostr.secrets.vault',
  appName: 'Nostr Secrets Vault',
  webDir: 'dist',
  // No server.url - app loads from local dist folder for production
};

export default config;
