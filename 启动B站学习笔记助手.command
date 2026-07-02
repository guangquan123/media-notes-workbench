#!/bin/zsh

set -e
cd "$(dirname "$0")"

APP_URL="http://localhost:8080/app/app_179bn4jet6k/"

echo "正在启动 B站学习笔记助手…"
echo "启动后会自动打开：$APP_URL"
echo "保持这个终端窗口开启即可；按 Control+C 可停止服务。"
echo

(sleep 7 && open "$APP_URL") &
npm run dev
