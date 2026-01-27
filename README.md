# 🔐 Nostr Secrets Vault

A secure, end-to-end encrypted password manager built on the Nostr protocol. Your secrets are encrypted locally and synced across devices using Nostr relays as encrypted self-addressed DMs.

![License](https://img.shields.io/badge/license-MIT-purple)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Android-blue)
![Nostr](https://img.shields.io/badge/protocol-Nostr-orange)
![Encryption](https://img.shields.io/badge/encryption-NIP--44%20%7C%20AES--256--GCM-green)

## 🌟 Overview

Nostr Secrets Vault is a zero-knowledge password manager that leverages the Nostr protocol for secure, decentralized secret synchronization. Unlike traditional password managers, there's no central server - your encrypted secrets are stored as messages to yourself on Nostr relays.

## ✨ Features

### 🔑 Key Management
- Generate new Nostr key pairs (nsec/npub)
- Import existing keys via nsec, hex, or NIP-19 format
- Multiple key support with easy switching
- Secure key storage with optional PIN encryption

### 🔒 Military-Grade Security
- **AES-256-GCM** vault encryption with PBKDF2 key derivation (100k iterations)
- **NIP-44** encryption for secrets (ChaCha20 + HMAC-SHA256)
- **Salt embedded in payload** - no exposed cryptographic material
- **SHA-256 integrity verification** with automatic self-healing
- Optional PIN protection with biometric unlock (Android)

### 📡 Decentralized Sync
- Sync secrets across devices via Nostr relays
- Self-addressed encrypted DMs (only you can decrypt)
- Configurable relay list with connection status
- Offline-first architecture with automatic sync

### 🎨 User Experience
- Cyberpunk/neon dark theme
- Mobile-first responsive design
- Tag-based organization with color coding
- Real-time search and filtering
- Swipe navigation between screens
- PWA support for app-like experience

## 🛡️ Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Device                          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────────────────────┐   │
│  │  PIN/Bio    │───▶│  PBKDF2 Key Derivation      │   │
│  └─────────────┘    │  (100k iterations + salt)    │   │
│                     └──────────────────────────────┘   │
│                                 │                       │
│                                 ▼                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │           AES-256-GCM Encrypted Vault            │  │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────┐  │  │
│  │  │ Nostr Keys │  │ Sign Logs  │  │ Settings  │  │  │
│  │  └────────────┘  └────────────┘  └───────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │              NIP-44 Encrypted Secrets             │  │
│  │         (ChaCha20 + HMAC-SHA256 per secret)       │  │
│  └──────────────────────────────────────────────────┘  │
│                          │                              │
└──────────────────────────│──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Nostr Relays                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ relay.damus │  │   nos.lol   │  │ nostr.band  │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                         │
│         Encrypted DMs (Kind 4) - Self-Addressed         │
│         Only the owner can decrypt the content          │
└─────────────────────────────────────────────────────────┘
```

### Security Guarantees

| Layer | Protection | Details |
|-------|------------|---------|
| Vault | AES-256-GCM | Keys & settings encrypted at rest |
| Salt | Embedded | PBKDF2 salt hidden in encrypted payload |
| Secrets | NIP-44 | Each secret individually encrypted |
| Transport | TLS + NIP-44 | End-to-end encrypted relay communication |
| Integrity | SHA-256 | Checksum verification with self-healing |

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ or Bun
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/AcierP/nostr-secrets.git
cd nostr-secrets

# Install dependencies
npm install
# or
bun install

# Start development server
npm run dev
# or
bun dev
```

### Build for Production

```bash
npm run build
npm run preview
```

### Android Build (Capacitor)

```bash
# Build web assets
npm run build

# Sync with Android
npx cap sync android

# Open in Android Studio
npx cap open android
```

## 📱 Usage

### First Launch

1. **Create or Import Key** - Generate a new Nostr identity or import your existing nsec
2. **Optional PIN Setup** - Enable PIN protection for vault encryption
3. **Add Your First Secret** - Tap the + button to create a secret

### Managing Secrets

- **Add**: Tap + button, enter title and content, select tags
- **View**: Tap the eye icon to decrypt and reveal content
- **Edit**: Tap the pencil icon on any secret
- **Delete**: Swipe left or use the delete button
- **Search**: Use the search bar to filter by title
- **Filter**: Tap tags to filter secrets by category

### Syncing

1. Go to **Settings** → **Manage Relays**
2. Add or remove relays as needed
3. Secrets automatically sync when connected
4. Green indicator = synced to all relays

## 🔧 Configuration

### Default Relays

```
wss://relay.damus.io
wss://relay.nostr.band
wss://nos.lol
wss://relay.primal.net
```

### Available Tags

| Tag | Color | Use Case |
|-----|-------|----------|
| Login | Blue | Website credentials |
| Crypto | Orange | Wallet seeds, keys |
| Finance | Green | Banking, cards |
| Personal | Pink | Personal info |
| Work | Purple | Work-related |
| API | Cyan | API keys, tokens |

## 🏗️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Build Tool | Vite |
| Mobile | Capacitor |
| Crypto | @noble/secp256k1, nostr-tools |
| State | React Context + Custom Hooks |

## 📁 Project Structure

```
src/
├── components/
│   ├── SecretsScreen.tsx    # Main secrets list & management
│   ├── AddSecretSheet.tsx   # Create/edit secret form
│   ├── KeysScreen.tsx       # Nostr key management
│   ├── SettingsScreen.tsx   # App settings
│   ├── SecuritySheet.tsx    # PIN & biometrics settings
│   ├── RelayManager.tsx     # Relay configuration
│   └── ui/                  # shadcn/ui components
├── context/
│   └── VaultContext.tsx     # Global encrypted state
├── hooks/
│   ├── useRelaySync.ts      # Relay synchronization
│   ├── useNostrDMs.ts       # DM fetching
│   └── useBiometrics.ts     # Native biometric auth
├── lib/
│   ├── vault.ts             # AES-256-GCM encryption
│   ├── nip44.ts             # NIP-44 implementation
│   ├── keyStore.ts          # Key generation & storage
│   ├── nostrRelay.ts        # Relay connections
│   └── vaultIntegrity.ts    # SHA-256 checksums
└── pages/
    └── Index.tsx            # Main app layout
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Style

- TypeScript strict mode
- Functional components with hooks
- Tailwind CSS for styling
- No inline styles

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Security Notice

- **Backup your nsec** - Lost keys cannot be recovered
- **Use strong PINs** - Short PINs are vulnerable to brute force
- **Verify relays** - Only use trusted relay servers
- **Regular updates** - Keep the app updated for security patches

## 🙏 Acknowledgments

- [Nostr Protocol](https://nostr.com/) - Decentralized social protocol
- [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) - Versioned encryption
- [noble-secp256k1](https://github.com/paulmillr/noble-secp256k1) - Audited crypto library
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Capacitor](https://capacitorjs.com/) - Native mobile runtime

---

<p align="center">
  <strong>Built with 💜 for the Nostr community</strong>
  <br>
  <em>Your keys, your secrets, your privacy.</em>
</p>
