#!/usr/bin/env bash
# start.sh — Kill any existing SIGMA processes and restart everything.
#
# Components:
#   SigmaServer     → http://localhost:8050  (SigmaServer/server.py — AI inference)
#   API server      → http://localhost:8060  (server/main.py — volume + config backend)
#   UI dev server   → http://localhost:5275  (client/ via Vite)
#
# Usage:  ./start.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIGMA_SERVER_DIR="/Users/bje/repos/SigmaServer"

AI_PORT=8050
API_PORT=8060
UI_PORT=5275

# ── helpers ───────────────────────────────────────────────────────────────────

port_in_use() {
  lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

kill_port() {
  local port="$1"
  local pids
  pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null || true
    for _ in $(seq 1 6); do
      port_in_use "$port" || break
      sleep 0.5
    done
  fi
}

log()  { printf "\033[1;34m[sigma]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[sigma]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[sigma]\033[0m %s\n" "$*"; }

# ── Kill existing processes ───────────────────────────────────────────────────

log "Stopping any existing SIGMA processes…"
kill_port "$AI_PORT"
kill_port "$API_PORT"
kill_port "$UI_PORT"
ok "Ports cleared."

# ── SigmaServer (AI inference) ────────────────────────────────────────────────

log "Starting SigmaServer on port $AI_PORT …"
cd "$SIGMA_SERVER_DIR"
"$SCRIPT_DIR/server/.venv/bin/python" -u server.py --port "$AI_PORT" >"$SCRIPT_DIR/sigmaserver.log" 2>&1 &
AI_PID=$!
ok "SigmaServer launched (PID $AI_PID) — logs → sigmaserver.log"
cd "$SCRIPT_DIR"

# ── API server ────────────────────────────────────────────────────────────────

log "Starting API server on port $API_PORT …"
cd "$SCRIPT_DIR/server"
.venv/bin/python -u main.py >"$SCRIPT_DIR/server.log" 2>&1 &
API_PID=$!
ok "API server launched (PID $API_PID) — logs → server.log"
cd "$SCRIPT_DIR"

# ── UI dev server ─────────────────────────────────────────────────────────────

log "Starting UI dev server on port $UI_PORT …"
cd "$SCRIPT_DIR/client"
npm run dev >"$SCRIPT_DIR/ui.log" 2>&1 &
UI_PID=$!
ok "UI dev server launched (PID $UI_PID) — logs → ui.log"
cd "$SCRIPT_DIR"

# ── Wait for all three to be ready ───────────────────────────────────────────

wait_for_port() {
  local label="$1" port="$2"
  printf "\033[1;34m[sigma]\033[0m Waiting for %-14s on http://localhost:%s" "$label" "$port"
  for _ in $(seq 1 30); do
    if port_in_use "$port"; then
      printf " ✓\n"
      return 0
    fi
    printf "."
    sleep 1
  done
  printf "\n"
  warn "$label did not become ready within 30 s — check logs for errors."
  return 1
}

echo ""
wait_for_port "SigmaServer" "$AI_PORT"
wait_for_port "API server"  "$API_PORT"
wait_for_port "UI"          "$UI_PORT"

# ── Done ─────────────────────────────────────────────────────────────────────

UI_URL="http://localhost:$UI_PORT"
echo ""
ok "SIGMA is ready."
echo ""
printf "  Open: \033[1;36m%s\033[0m\n" "$UI_URL"
echo ""
read -r -p "Press Enter to open in your default browser (or Ctrl-C to skip)…"
open "$UI_URL"
