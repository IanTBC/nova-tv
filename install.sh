#!/bin/bash
# Nova TV installer — downloads the app from GitHub and installs it in Applications.
set -e
BASE="https://raw.githubusercontent.com/IanTBC/nova-tv/main"
[ "$(uname -m)" = "arm64" ] && ARCH=arm64 || ARCH=x64
APP="/Applications/Nova TV.app"
TMP="$(mktemp -d)"
echo ""
echo "  Nova TV — installing for $( [ $ARCH = arm64 ] && echo 'Apple Silicon' || echo 'Intel' ) Mac"
echo ""
osascript -e 'quit app "Nova TV"' >/dev/null 2>&1 || true
curl -fsSL "$BASE/releases/mac-$ARCH/parts.txt" -o "$TMP/parts.txt"
N=$(wc -l < "$TMP/parts.txt" | tr -d ' '); I=0
while read -r P; do
  I=$((I+1)); echo "  Downloading ($I of $N)…"
  curl -fL --progress-bar "$BASE/releases/mac-$ARCH/$P" >> "$TMP/nova.tar.gz"
done < "$TMP/parts.txt"
echo "  Unpacking…"
tar -xzf "$TMP/nova.tar.gz" -C "$TMP"
echo "  Installing to Applications…"
ditto "$TMP/Nova TV.app" "$APP"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1
rm -rf "$TMP"
echo ""
echo "  ✓ Nova TV is installed. Opening it now — enjoy!"
echo ""
open "$APP"
