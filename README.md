# 🔐 Nostr Secrets

A secure, encrypted password vault built on Nostr. Store your secrets locally with military-grade encryption, and optionally sync them across devices using Nostr relays.

![License](https://img.shields.io/badge/license-MIT-purple)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Android%20%7C%20iOS-blue)
![Nostr](https://img.shields.io/badge/protocol-Nostr-orange)

## ✨ Features

- **🔑 Nostr Key Management** - Generate or import Nostr key pairs (nsec/npub)
- **🔒 End-to-End Encryption** - All secrets encrypted with NIP-04 using your private key
- **📱 Mobile-First Design** - Optimized for smartphones with swipe navigation
- **🎨 Cyberpunk UI** - Beautiful neon-glow dark theme
- **🏷️ Tag Organization** - Organize secrets with customizable colored tags
- **🔍 Search & Filter** - Quickly find secrets by title or tags
- **📡 Relay Sync** - Optionally sync encrypted secrets as self-addressed DMs
- **🔐 PIN Protection** - Optional PIN lock with biometric support
- **📴 Offline First** - Works completely offline, sync when you want
- **🌐 Open Source** - Fully auditable, self-hostable

## 🛡️ Security

- **Local-first**: Your secrets never leave your device unless you explicitly sync
- **NIP-04 Encryption**: Industry-standard Nostr encryption
- **No Backend**: Zero server-side code, no databases, no tracking
- **PIN + Biometrics**: Optional device-level security layer
- **Self-addressed DMs**: When syncing, secrets are encrypted messages to yourself

## 📱 Screenshots

| Secrets | Add Secret | Keys |
|---------|------------|------|
| Encrypted vault | Create new secret | Manage keys |

## 🚀 Quick Start

### Web (PWA)

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/nostr-secrets.git
cd nostr-secrets

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Android

```bash
# Build the web app
npm run build

# Add Android platform
npx cap add android

# Sync and open in Android Studio
npx cap sync android
npx cap open android
```

### iOS

```bash
# Build the web app
npm run build

# Add iOS platform
npx cap add ios

# Sync and open in Xcode
npx cap sync ios
npx cap open ios
```

## 🔧 Configuration

### Relay Configuration

By default, the app connects to popular Nostr relays. You can configure custom relays in **Settings > Manage Relays**.

Default relays:
- `wss://relay.damus.io`
- `wss://relay.nostr.band`
- `wss://nos.lol`

### Environment Variables

No environment variables required! Everything runs client-side.

## 📖 How It Works

1. **Generate or Import Keys**: Create a new Nostr identity or import your existing nsec
2. **Add Secrets**: Enter a title and secret content, select tags
3. **Automatic Encryption**: Content is encrypted using NIP-04 with your key
4. **Local Storage**: Encrypted secrets stored in browser/device storage
5. **Optional Sync**: Send encrypted secrets to relays as self-addressed DMs
6. **Decrypt on Demand**: Tap the eye icon to decrypt and view

## 🏗️ Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Build**: Vite
- **Mobile**: Capacitor (Android/iOS)
- **Crypto**: @noble/secp256k1, @scure/base
- **Protocol**: Nostr (NIP-04 encryption)

## 📁 Project Structure

```
src/
├── components/          # React components
│   ├── SecretsScreen.tsx    # Main secrets list
│   ├── AddSecretSheet.tsx   # Add secret form
│   ├── KeysScreen.tsx       # Key management
│   └── SettingsScreen.tsx   # App settings
├── context/
│   └── VaultContext.tsx     # Global state & encryption
├── lib/
│   ├── keyStore.ts          # Key generation & storage
│   ├── secretStore.ts       # Secret types & tags
│   ├── nostrRelay.ts        # Relay connections & NIP-04
│   └── vault.ts             # Encrypted storage
└── pages/
    └── Index.tsx            # Main app layout
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Nostr Protocol](https://nostr.com/) - The decentralized social protocol
- [noble-secp256k1](https://github.com/paulmillr/noble-secp256k1) - Excellent crypto library
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Capacitor](https://capacitorjs.com/) - Native mobile runtime

## ⚠️ Disclaimer

This software is provided "as is" without warranty of any kind. Always backup your private keys securely. The developers are not responsible for any lost data or compromised secrets.

---

**Built with 💜 for the Nostr community**
