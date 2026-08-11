#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Starting FRAME Mobile on port ${PORT:-5173}"
exec pnpm exec expo start --localhost --port "${PORT:-5173}"
