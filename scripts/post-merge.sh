#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm exec playwright install chromium --with-deps
pnpm --filter db push
