#!/bin/zsh

set -euo pipefail
cd "$(dirname "$0")"

APP_URL="http://localhost:8081/app/app_179bn4jet6k/"
HEALTH_URL="http://127.0.0.1:8081/app/app_179bn4jet6k/"
LOG_FILE="logs/dev-local-launch.log"
AGENT_LABEL="com.media-notes-workbench.dev"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"
AGENT_TEMPLATE="scripts/local-dev-launch-agent.plist.template"
USER_ID="$(id -u)"

if launchctl print "gui/$USER_ID/$AGENT_LABEL" >/dev/null 2>&1; then
    echo "多媒体笔记工作台已经在运行。"
    echo "正在打开：$APP_URL"
    open "$APP_URL"
    exit 0
fi

mkdir -p pids logs

echo "正在后台启动 多媒体笔记工作台…"
echo "启动日志：$LOG_FILE"
echo "服务就绪后会自动打开：$APP_URL"

# launchd 需要显式 PATH，才能读取 Homebrew 和 npm 全局安装的依赖。
sed -e "s|__PROJECT_DIR__|$PWD|g" \
  -e "s|__USER_HOME__|$HOME|g" \
  "$AGENT_TEMPLATE" >"$AGENT_PLIST"
launchctl bootstrap "gui/$USER_ID" "$AGENT_PLIST"

# 该检查与服务进程分离，关闭启动终端也不会阻止首页自动打开。
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

echo "已由后台守护启动。可直接关闭此终端。"
echo "启动日志：$LOG_FILE"
