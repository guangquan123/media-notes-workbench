#!/bin/zsh

set -euo pipefail
cd "$(dirname "$0")"

PID_FILE="pids/dev-local.pid"

echo "正在停止 多媒体笔记工作台…"
npm run stop

if [[ ! -f "$PID_FILE" ]]; then
  echo "工作台已停止。"
  exit 0
fi

for attempt in {1..15}; do
  RUNNING_PID="$(<"$PID_FILE")"
  if [[ "$RUNNING_PID" != <-> ]] || ! kill -0 "$RUNNING_PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "工作台已停止。"
    exit 0
  fi
  sleep 1
done

echo "停止信号已发送，服务仍在退出中。请等待几秒后再次运行本停止器。"
