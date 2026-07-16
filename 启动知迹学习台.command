#!/bin/zsh

set -e
cd "$(dirname "$0")"

APP_URL="http://localhost:8081/app/app_179bn4jet6k/"

echo "正在启动 知迹学习台…"
echo "服务完全就绪后会自动打开：$APP_URL"
echo "保持这个终端窗口开启即可；按 Control+C 可停止服务。"
echo

(
  for attempt in {1..180}; do
    if nc -z localhost 3000 >/dev/null 2>&1 &&
      curl --silent --fail --max-time 2 "$APP_URL" >/dev/null 2>&1; then
      open "$APP_URL"
      exit 0
    fi
    sleep 1
  done

  echo "等待服务启动超时，请查看当前终端中的错误信息。"
) &

# 日常启动无需同步并升级框架依赖；需要升级时再单独运行 npm run upgrade。
CLIENT_DEV_PORT=8081 npm run dev:local
