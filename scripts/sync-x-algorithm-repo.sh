#!/usr/bin/env bash
set -euo pipefail

X_ALGO_URL="${X_ALGO_URL:-https://github.com/xai-org/x-algorithm.git}"
X_ALGO_BRANCH="${X_ALGO_BRANCH:-main}"
X_ALGO_DIR="${X_ALGO_DIR:-$HOME/x-algorithm}"

if [ ! -d "$X_ALGO_DIR/.git" ]; then
  git clone --branch "$X_ALGO_BRANCH" --single-branch "$X_ALGO_URL" "$X_ALGO_DIR"
else
  git -C "$X_ALGO_DIR" fetch origin "$X_ALGO_BRANCH" --prune
  git -C "$X_ALGO_DIR" checkout "$X_ALGO_BRANCH"
  git -C "$X_ALGO_DIR" pull --ff-only origin "$X_ALGO_BRANCH"
fi

echo "x-algorithm synced at $X_ALGO_DIR"
git -C "$X_ALGO_DIR" rev-parse HEAD
