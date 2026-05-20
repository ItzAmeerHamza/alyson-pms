#!/bin/bash
# Install dependencies before the network is disabled
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

if [ -d web ] && [ -f web/package-lock.json ]; then
  (cd web && npm ci) 2>/dev/null || true
fi

if [ -d desktop-agent ]; then
  if [ -f desktop-agent/package-lock.json ]; then
    (cd desktop-agent && npm ci)
  else
    (cd desktop-agent && npm install)
  fi
fi
