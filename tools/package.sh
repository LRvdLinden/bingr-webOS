#!/usr/bin/env bash
# Pakt de gebouwde app (tools/build_app.py) in tot een .ipk met de webOS CLI (ares-package uit node_modules,
# vaste versie in package.json/package-lock.json) en controleert het resultaat (tools/check_ipk.py).
#   bash tools/package.sh [appmap] [uitvoermap]     (standaard build/app en dist)
# Uitvoer: <uitvoermap>/Bingr-<versie>-build<build>.ipk. Nooit committen of op GitHub zetten (zie CLAUDE.md).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-$ROOT/build/app}"
OUT="${2:-$ROOT/dist}"
ARES="$ROOT/node_modules/.bin/ares-package"
[ -x "$ARES" ] || { echo "ares-package ontbreekt: eerst npm ci"; exit 1; }
[ -f "$APP/appinfo.json" ] || { echo "geen appinfo.json in $APP: eerst python3 tools/build_app.py"; exit 1; }
V=$(grep '^BINGR_VERSION=' "$ROOT/version.properties" | cut -d= -f2)
B=$(grep '^BINGR_BUILD=' "$ROOT/version.properties" | cut -d= -f2)
mkdir -p "$OUT"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
"$ARES" --version 2>/dev/null | head -1 || true
"$ARES" --check "$APP"
"$ARES" --outdir "$TMP" "$APP"
IPK=$(ls "$TMP"/*.ipk | head -1)
[ -s "$IPK" ] || { echo "ares-package maakte geen .ipk"; exit 1; }
NAME="Bingr-$V-build$B.ipk"
rm -f "$OUT"/*.ipk
mv "$IPK" "$OUT/$NAME"
"$ARES" --info "$OUT/$NAME" || true
python3 "$ROOT/tools/check_ipk.py" "$OUT/$NAME" "$APP/appinfo.json"
echo "$OUT/$NAME"
