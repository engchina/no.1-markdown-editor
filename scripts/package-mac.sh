#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
BUNDLE_ROOT="$REPO_ROOT/src-tauri/target/release/bundle"

cd "$REPO_ROOT"

echo ""
echo -e "\033[36m==> Building macOS installer packages...\033[0m"
echo "Repo root: $REPO_ROOT"

HOST_OS="$(uname -s)"
if [ "$HOST_OS" != "Darwin" ]; then
  echo -e "\033[31mThis script must be run on macOS.\033[0m"
  echo "Tauri can only create .app and .dmg bundles on a Mac host."
  echo "Current host: $HOST_OS"
  echo "Use a macOS machine or macOS CI runner for this package."
  exit 1
fi

# Builds an app bundle and a dmg
npm run tauri -- build

if [ $? -ne 0 ]; then
  echo -e "\033[31mBuild failed!\033[0m"
  exit 1
fi

echo ""
echo -e "\033[32m==> Installer packages created. Find them under:\033[0m"
echo " - $BUNDLE_ROOT/dmg"
echo " - $BUNDLE_ROOT/macos"

if [ "$1" == "--open" ]; then
  open "$BUNDLE_ROOT"
fi
