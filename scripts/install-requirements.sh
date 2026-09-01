#!/usr/bin/env bash
# Install machine + repo dependencies for Alyson Pulse.
# Usage (from repo root): bash scripts/install-requirements.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { printf '\n==> %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

log "Alyson Pulse — install requirements"
echo "Repo: $ROOT"

if [[ "$(uname -s)" == "Darwin" ]]; then
  if ! xcode-select -p >/dev/null 2>&1; then
    log "Installing Xcode Command Line Tools (GUI prompt)…"
    xcode-select --install || true
    echo "Finish the Xcode CLT installer, then re-run this script."
    exit 1
  fi
  echo "Xcode CLT: $(xcode-select -p)"
fi

if [[ "$(uname -s)" == "Darwin" ]] || [[ -f /home/linuxbrew/.linuxbrew/bin/brew ]]; then
  if ! have brew; then
    log "Installing Homebrew…"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [[ -x /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi
  log "Installing Homebrew packages from requirements/Brewfile…"
  brew bundle --file "$ROOT/requirements/Brewfile"
  if brew --prefix node@20 >/dev/null 2>&1; then
    brew link --overwrite --force node@20 >/dev/null 2>&1 || true
    export PATH="$(brew --prefix node@20)/bin:$PATH"
  fi
else
  echo "Homebrew not used on this OS. Install Node 20+, Python 3.11+, git, psql, aws, and gh yourself, then re-run."
fi

if ! have node; then
  echo "Node.js is required (20+). Install it and re-run."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node $(node -v) is too old. Need 20+."
  exit 1
fi

echo "node $(node -v)  npm $(npm -v)"

log "Installing npm workspaces (desktop-agent, backend, tasks)…"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

if have python3; then
  log "Installing Python packages from requirements/python.txt…"
  python3 -m pip install --upgrade pip >/dev/null
  python3 -m pip install -r "$ROOT/requirements/python.txt" || {
    echo "Python extras failed (input monitoring on Mac may be limited). Continuing."
  }
else
  echo "python3 not found — skipped PyObjC. Desktop input monitoring on macOS needs Python 3.11+."
fi

copy_env() {
  local src="$1"
  local dest="$2"
  if [[ -f "$src" && ! -f "$dest" ]]; then
    cp "$src" "$dest"
    echo "Created $dest from example (fill in secrets)."
  fi
}

log "Seeding .env files if missing…"
copy_env "$ROOT/backend/.env.example" "$ROOT/backend/.env"
copy_env "$ROOT/desktop-agent/.env.example" "$ROOT/desktop-agent/.env"

echo
echo "Done. Next: edit backend/.env and desktop-agent/.env, then see SETUP.md"
echo "  API:     npm run dev:backend"
echo "  Desktop: npm run dev:desktop"
