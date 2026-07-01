#!/usr/bin/env bash
# External reaper for the shared API server started by post-merge.sh.
#
# Run this as a CI cleanup step AFTER post-merge.sh exits — even if it was
# killed abnormally (OOM, SIGKILL from Playwright) and its EXIT trap never
# fired.  When the trap fires normally this file is already deleted; the script
# is a no-op in that case.
#
# Usage:
#   bash scripts/cleanup-post-merge-api.sh
#
# How it works:
#   post-merge.sh writes the API server's PGID (== PID because setsid was used)
#   to /tmp/post-merge-api.pgid before waiting for the port to open.  That file
#   persists across a SIGKILL of the parent shell.  This script reads it and
#   sends SIGTERM to the entire process group, then waits briefly and sends
#   SIGKILL to any survivors.

set -uo pipefail

PGID_FILE=/tmp/post-merge-api.pgid

if [ ! -f "$PGID_FILE" ]; then
  echo "[cleanup-api] No pidfile found ($PGID_FILE) — nothing to clean up."
  exit 0
fi

PGID=$(cat "$PGID_FILE")

if [ -z "$PGID" ]; then
  echo "[cleanup-api] Pidfile is empty — removing and exiting."
  rm -f "$PGID_FILE"
  exit 0
fi

echo "[cleanup-api] Sending SIGTERM to API server process group $PGID..."
kill -- -"$PGID" 2>/dev/null || true

# Give processes a moment to exit cleanly, then SIGKILL any survivors.
sleep 2
if kill -0 -- -"$PGID" 2>/dev/null || kill -0 "$PGID" 2>/dev/null; then
  echo "[cleanup-api] Sending SIGKILL to remaining processes in group $PGID..."
  kill -9 -- -"$PGID" 2>/dev/null || kill -9 "$PGID" 2>/dev/null || true
fi

rm -f "$PGID_FILE"
echo "[cleanup-api] Done."
