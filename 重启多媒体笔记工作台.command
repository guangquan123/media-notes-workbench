#!/bin/zsh

set -euo pipefail
cd "$(dirname "$0")"

APP_URL="http://localhost:8081/app/app_179bn4jet6k/"
HEALTH_URL="http://127.0.0.1:8081/app/app_179bn4jet6k/"
AGENT_LABEL="com.media-notes-workbench.dev"
USER_ID="$(id -u)"

echo "正在重启 多媒体笔记工作台…"

if ! launchctl print "gui/$USER_ID/$AGENT_LABEL" >/dev/null 2>&1; then
  echo "后台服务尚未启动，改为启动新服务…"
  exec "$(dirname "$0")/启动多媒体笔记工作台.command"
fi

launchctl kickstart -k "gui/$USER_ID/$AGENT_LABEL"

# 启动检测独立运行；服务就绪后自动打开首页。
nohup env APP_URL="$APP_URL" HEALTH_URL="$HEALTH_URL" \
  /bin/zsh -c '
    for attempt in {1..180}; do
      if curl --silent --fail --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
        open "$APP_URL"
        exit 0
      fi
      sleep 1
    done
    exit 1
  ' </dev/null >/dev/null 2>&1 &

echo "已在后台重启。服务就绪后会自动打开首页。"
