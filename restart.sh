#!/usr/bin/env bash
# Copyright Bradley J Erickson, 2026.
# restart.sh — Stop running SIGMA components and restart them.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

API_PORT=8050
UI_PORT=5275

log()  { printf "\033[1;34m[sigma]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[sigma]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[sigma]\033[0m %s\n" "$*"; }

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    log "Stopping process(es) on port $port (PID $pids) …"
    kill $pids
    # Wait up to 5 s for port to clear
    for _ in $(seq 1 10); do
      sleep 0.5
      lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1 || break
    done
    ok "Port $port freed."
  else
    warn "Nothing running on port $port — skipping."
  fi
}

kill_port "$API_PORT"
kill_port "$UI_PORT"

echo ""
exec "$SCRIPT_DIR/start.sh"
