#!/usr/bin/env bash

# Safe URL capture watch harness
# - Finds latest log robustly (symlink or newest session-*.log)
# - Optional fresh agent restart to ensure a new log
# - Opens Safari via `open` (avoids AppleScript quoting)
# - Greps with fixed strings to avoid regex pitfalls
# - Cleans up tail PID and temp files

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

DURATION=30
FRESH=0
OPEN_URLS=1

usage() {
  echo "Usage: $0 [--fresh] [--duration SECONDS] [--no-open]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fresh)
      FRESH=1
      shift
      ;;
    --duration)
      DURATION="${2:-30}"
      shift 2 || { usage; exit 1; }
      ;;
    --no-open)
      OPEN_URLS=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

log_info() { echo "[INFO] $*"; }
log_warn() { echo "[WARN] $*"; }
log_err()  { echo "[ERROR] $*"; }

ensure_debug_logs_dir() {
  mkdir -p debug-logs
}

start_fresh_session() {
  log_info "Restarting desktop agent for a fresh session..."
  pkill -f "time-flow-admin/desktop-agent.*electron" 2>/dev/null || true
  pkill -f external_input_monitor_macos.py 2>/dev/null || true
  ensure_debug_logs_dir
  local ts
  ts="$(date +%Y%m%d-%H%M%S)"
  export SESSION_LOG="debug-logs/session-${ts}.log"
  : > "$SESSION_LOG"
  ln -sf "$ROOT_DIR/$SESSION_LOG" debug-logs/latest-run.log
  # Start agent (auto-tracking and URL diagnostics enabled)
  (AUTO_START_TRACKING=true DIAG_URL=1 npm run start --silent >> "$SESSION_LOG" 2>&1 & echo $! > debug-logs/latest-npm.pid)
  # Give it a moment to boot
  sleep 6
}

pick_latest_log() {
  local candidate
  if [[ -L debug-logs/latest-run.log ]]; then
    candidate="$(readlink debug-logs/latest-run.log)"
  else
    # Find newest session log without exposing globbing to the shell
    candidate="$(find debug-logs -type f -name 'session-*.log' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1 || true)"
  fi
  echo "$candidate"
}

tail_with_pidfile() {
  local log_file="$1"
  export URLWATCH_TMP="$(mktemp)"
  tail -n0 -F "$log_file" >> "$URLWATCH_TMP" &
  echo $! > /tmp/urlwatch.pid
}

cleanup() {
  local ec=$?
  if [[ -f /tmp/urlwatch.pid ]]; then
    kill "$(cat /tmp/urlwatch.pid)" 2>/dev/null || true
    rm -f /tmp/urlwatch.pid
  fi
  if [[ -n "${URLWATCH_TMP:-}" && -f "${URLWATCH_TMP:-}" ]]; then
    rm -f "$URLWATCH_TMP"
  fi
  exit $ec
}
trap cleanup EXIT INT TERM

main() {
  ensure_debug_logs_dir

  if [[ $FRESH -eq 1 ]]; then
    start_fresh_session
  fi

  local LOG
  LOG="$(pick_latest_log)"
  if [[ -z "$LOG" || ! -f "$LOG" ]]; then
    log_err "No log file found. Consider running with --fresh."
    exit 1
  fi
  log_info "Using log: $LOG"

  tail_with_pidfile "$LOG"
  sleep 1

  if [[ $OPEN_URLS -eq 1 ]]; then
    log_info "Opening Safari to Masrawy..."
    open -a Safari 'https://www.masrawy.com/' || true
    sleep 10
    log_info "Opening Safari to Google test..."
    open -a Safari 'https://www.google.com/?ai-test=3' || true
  fi

  log_info "Watching for ${DURATION}s..."
  sleep "$DURATION"

  # Stop tail (handled by trap as well)
  if [[ -f /tmp/urlwatch.pid ]]; then
    kill "$(cat /tmp/urlwatch.pid)" 2>/dev/null || true
  fi

  echo "--- URL capture signals (tail) ---"
  # Fixed-string grep (-F) for robustness
  grep -nF \
    -e '[URL] Enqueue' \
    -e 'URL-DIAG' \
    -e 'Queued via' \
    -e '[URL-SYNC] Inserted ' \
    -e 'Extracted URL' \
    -e 'Direct DB insert succeeded' \
    "${URLWATCH_TMP}" | tail -n 60 || echo none

  echo "--- Errors/Warnings (tail) ---"
  grep -nF \
    -e '❌' \
    -e 'error' \
    -e 'exception' \
    -e 'failed' \
    -e 'unauthorized' \
    -e 'critical' \
    -e 'unhandled' \
    -e 'timeout' \
    "${URLWATCH_TMP}" | tail -n 40 || echo none
}

main "$@"


