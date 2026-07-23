#!/bin/bash
set -euo pipefail

APP_DIR="/opt/API-forge"
SANDBOX_BIN="${APP_DIR}/chrome-sandbox"

if [ -e "$SANDBOX_BIN" ]; then
  chown root:root "$SANDBOX_BIN"
  chmod 4755 "$SANDBOX_BIN"
fi
