#!/bin/bash
# Script: build-sign-publish-from-git.sh
# Automatizează buildul, semnarea și publicarea APK-ului din ultima versiune din GitHub

set -e
REPO_URL="https://github.com/tzongocu/nostr-secrets.git"
REPO_DIR="/tmp/nostr-secrets-vault-build-$(date +%s)"
KEYSTORE_PATH="$HOME/Nostr-Auhentificator/Nostr-Secrets-Vault/android/nostr-authenticator.keystore"
KEY_ALIAS="nostr-authenticator"
RELEASES_DIR="$HOME/Nostr-Auhentificator/Nostr-Secrets-Vault/releases"
APK_NAME="nostr-secrets-v1.0.6"

# 1. Clonează repo curat
rm -rf "$REPO_DIR"
git clone "$REPO_URL" "$REPO_DIR"
cd "$REPO_DIR/android"

# 2. Build APK
./gradlew assembleRelease

# 3. Copiază APK-ul unsigned
cp app/build/outputs/apk/release/app-release-unsigned.apk "$RELEASES_DIR/${APK_NAME}-unsigned.apk"

# 4. Semnează APK-ul
apksigner sign --ks "$KEYSTORE_PATH" --ks-key-alias "$KEY_ALIAS" --out "$RELEASES_DIR/${APK_NAME}.apk" "$RELEASES_DIR/${APK_NAME}-unsigned.apk"

# 5. Publică pe GitHub releases
cd "$HOME/Nostr-Auhentificator/Nostr-Secrets-Vault"
gh release delete v1.0.6 --repo tzongocu/nostr-secrets --yes || true
gh release create v1.0.6 "$RELEASES_DIR/${APK_NAME}.apk" --title "Nostr Secrets Vault 1.0.6" --notes "APK semnat, build din repo curat GitHub." --repo tzongocu/nostr-secrets --latest --verify-tag

# 6. Publică pe Zap Store
./publish.sh

echo "Build, semnare și publicare completă din repo curat finalizată!"