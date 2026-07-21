#!/bin/zsh

set -euo pipefail
cd "$(dirname "$0")"

PID_FILE="pids/dev-local.pid"

echo "正在重启 多媒体笔记工作台…"
npm run stop

if [[ -f "$PID_FILE" ]]; then
  for attempt in {1..15}; do
    RUNNING_PID="$(<"$PID_FILE")"
    if [[ "$RUNNING_PID" != <-> ]] || ! kill -0 "$RUNNING_PID" 2>/dev/null; then
      rm -f "$PID_FILE"
      break
    fi
    sleep 1
  done
fi

if [[ -f "$PID_FILE" ]]; then
  echo "旧服务仍在退出中，暂不启动新服务。请几秒后再次运行本重启器。"
  exit 1
fi

echo "旧服务已停止，正在启动新服务…"
exec "$(dirname "$0")/启动多媒体笔记工作台.command"
