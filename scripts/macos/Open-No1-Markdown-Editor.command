#!/bin/bash
# No.1 Markdown Editor - macOS first-launch helper / 初回起動ヘルパー / 首次启动助手
#
# This macOS build is not notarized by Apple, so Gatekeeper can block the first
# installation. This script removes that initial quarantine attribute and opens
# the app. Releases with the signed in-app updater do not need this after each
# update; users migrating from an older release may need it one final time.
#
# この macOS ビルドは Apple の公証を受けていないため、初回インストール時に
# セキュリティ警告でブロックされることがあります。このファイルをダブルクリック
# すると quarantine 属性を解除して起動します。署名付きアプリ内アップデーターを
# 搭載していない旧版からの移行時は、最後に一度だけ必要になる場合があります。

set -u

APP_NAME="No.1 Markdown Editor.app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

candidates=(
  "/Applications/${APP_NAME}"
  "${HOME}/Applications/${APP_NAME}"
  "${SCRIPT_DIR}/${APP_NAME}"
  "${HOME}/Downloads/${APP_NAME}"
  "${HOME}/Desktop/${APP_NAME}"
)

app_path=""
for candidate in "${candidates[@]}"; do
  if [ -d "${candidate}" ]; then
    app_path="${candidate}"
    break
  fi
done

if [ -z "${app_path}" ]; then
  echo "「${APP_NAME}」が見つかりませんでした。 / Could not find the app."
  echo "先に DMG からアプリケーションフォルダへドラッグしてから、もう一度このファイルをダブルクリックしてください。"
  echo "First drag the app from the DMG into your Applications folder, then double-click this file again."
  echo ""
  echo "Return キーを押すと閉じます。 / Press Return to close."
  read -r _
  exit 1
fi

echo "対象アプリ / Target: ${app_path}"
echo "セキュリティ属性(quarantine)を解除しています... / Removing quarantine attribute..."
xattr -dr com.apple.quarantine "${app_path}" 2>/dev/null

echo "アプリを起動します... / Launching the app..."
if open "${app_path}"; then
  echo "完了しました。No.1 Markdown Editor を起動できます。 / Done. The app should now open."
else
  echo "起動に失敗しました。パスをご確認ください / Failed to launch. Please check the path: ${app_path}"
fi

echo ""
echo "このウィンドウは閉じて構いません。 / You can close this window."
