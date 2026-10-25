#!/bin/bash
# No.1 Markdown Editor - initial-install or one-time-migration helper / 初回インストール・一度限りの移行ヘルパー / 首次安装或一次性迁移助手
#
# Use this only when macOS blocks the initial installation or a migration from
# v0.27.10 or earlier. Do not use it for normal in-app updates. This script
# removes the quarantine attribute and opens the app.
#
# 初回インストール時、または v0.27.10 以前からの移行時に macOS にブロックされた
# 場合のみ使用してください。通常のアプリ内更新では使用しません。
# 仅在首次安装或从 v0.27.10 及更早版本迁移时被 macOS 阻止启动的情况下使用。
# 正常的应用内更新不要运行此助手。

set -u

echo "初回インストール・旧版からの移行専用です。通常の更新では使用しません。 / Initial install or legacy migration only. Do not use for normal updates. / 仅用于首次安装或旧版迁移，请勿用于正常更新。"
echo ""

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
