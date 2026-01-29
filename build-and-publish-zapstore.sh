#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
APK_PATH="$PROJECT_ROOT/releases/nostr-secrets-v1.0.3.apk"
ZAPSTORE_YAML="$PROJECT_ROOT/zapstore.yaml"
PUBLISH_SH="$PROJECT_ROOT/publish.sh"

if [ ! -f "$APK_PATH" ]; then
  echo "❌ APK not found: $APK_PATH"
  exit 1
fi

if [ ! -f "$ZAPSTORE_YAML" ]; then
  echo "❌ zapstore.yaml not found: $ZAPSTORE_YAML"
  exit 1
fi

if [ ! -f "$PUBLISH_SH" ]; then
  echo "❌ publish.sh not found in project root"
  exit 1
fi

chmod +x "$PUBLISH_SH"

echo "✅ All files present. Ready to publish to Zap Store."
echo "📤 Publishing to Zapstore…"
"$PUBLISH_SH" --overwrite-release

echo "------------------------------------------------"
echo "🎉 Zapstore publish completed successfully"
echo "📦 Application update signed and published"
