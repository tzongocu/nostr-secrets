#!/usr/bin/env bash
# Script: build-android.sh
# Automated build + sync + APK generation for Nostr Secrets Vault

set -euo pipefail

# Configuration
VERSION="1.0.8"
VERSION_CODE=6
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
RELEASES_DIR="$PROJECT_ROOT/releases"
APK_NAME="nostr-secrets-v${VERSION}"
KEYSTORE_PATH="$PROJECT_ROOT/android/nostr-authenticator.keystore"
KEY_ALIAS="nostr-authenticator"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Nostr Secrets Vault build process...${NC}"
echo "   Version: $VERSION (code: $VERSION_CODE)"
echo ""

# Step 1: Install dependencies
echo -e "${YELLOW}📦 Step 1/5: Installing dependencies...${NC}"
npm install

# Step 2: Build web assets
echo -e "${YELLOW}🔨 Step 2/5: Building web assets...${NC}"
npm run build

# Verify dist folder exists
if [ ! -d "$PROJECT_ROOT/dist" ]; then
  echo -e "${RED}❌ Build failed: dist folder not found${NC}"
  exit 1
fi

echo -e "${GREEN}   ✓ Web assets built successfully${NC}"

# Step 3: Sync with Capacitor
echo -e "${YELLOW}📱 Step 3/5: Syncing with Capacitor...${NC}"
npx cap sync android

echo -e "${GREEN}   ✓ Capacitor sync complete${NC}"

# Step 4: Build release APK
echo -e "${YELLOW}🏗️  Step 4/5: Building release APK...${NC}"
cd "$PROJECT_ROOT/android"
./gradlew assembleRelease

# Find the unsigned APK
UNSIGNED_APK="$PROJECT_ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"

if [ ! -f "$UNSIGNED_APK" ]; then
  echo -e "${RED}❌ Build failed: APK not found${NC}"
  exit 1
fi

echo -e "${GREEN}   ✓ APK built successfully${NC}"

# Step 5: Sign the APK
echo -e "${YELLOW}🔐 Step 5/5: Signing APK...${NC}"

# Create releases directory if it doesn't exist
mkdir -p "$RELEASES_DIR"

# Copy unsigned APK
cp "$UNSIGNED_APK" "$RELEASES_DIR/${APK_NAME}-unsigned.apk"

# Check if keystore exists
if [ -f "$KEYSTORE_PATH" ]; then
  # Sign with apksigner (preferred) or jarsigner
  if command -v apksigner &> /dev/null; then
    apksigner sign \
      --ks "$KEYSTORE_PATH" \
      --ks-key-alias "$KEY_ALIAS" \
      --out "$RELEASES_DIR/${APK_NAME}.apk" \
      "$RELEASES_DIR/${APK_NAME}-unsigned.apk"
    echo -e "${GREEN}   ✓ APK signed with apksigner${NC}"
  elif command -v jarsigner &> /dev/null; then
    cp "$RELEASES_DIR/${APK_NAME}-unsigned.apk" "$RELEASES_DIR/${APK_NAME}.apk"
    jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
      -keystore "$KEYSTORE_PATH" \
      "$RELEASES_DIR/${APK_NAME}.apk" "$KEY_ALIAS"
    
    # Align if zipalign is available
    if command -v zipalign &> /dev/null; then
      zipalign -v 4 "$RELEASES_DIR/${APK_NAME}.apk" "$RELEASES_DIR/${APK_NAME}-aligned.apk"
      mv "$RELEASES_DIR/${APK_NAME}-aligned.apk" "$RELEASES_DIR/${APK_NAME}.apk"
    fi
    echo -e "${GREEN}   ✓ APK signed with jarsigner${NC}"
  else
    echo -e "${YELLOW}   ⚠ No signing tool found. APK remains unsigned.${NC}"
    echo "   Install Android SDK build-tools to sign the APK"
  fi
else
  echo -e "${YELLOW}   ⚠ Keystore not found at: $KEYSTORE_PATH${NC}"
  echo "   APK saved as unsigned: $RELEASES_DIR/${APK_NAME}-unsigned.apk"
fi

# Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Build complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "📁 Output files:"
if [ -f "$RELEASES_DIR/${APK_NAME}.apk" ]; then
  echo "   Signed APK: $RELEASES_DIR/${APK_NAME}.apk"
fi
echo "   Unsigned APK: $RELEASES_DIR/${APK_NAME}-unsigned.apk"
echo ""
echo "📲 To install on device:"
echo "   adb install $RELEASES_DIR/${APK_NAME}.apk"
echo ""
echo "🚀 To publish to ZapStore:"
echo "   ./publish.sh"
