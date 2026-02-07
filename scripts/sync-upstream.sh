#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/xai-org/x-algorithm.git}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository." >&2
  exit 1
fi

if [ "${ALLOW_DIRTY_SYNC:-0}" != "1" ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Tracked changes detected. Commit or stash tracked edits before syncing upstream." >&2
    exit 1
  fi
fi

if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

git fetch "$UPSTREAM_REMOTE" "$TARGET_BRANCH" --prune

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$TARGET_BRANCH" ]; then
  echo "Current branch is '$current_branch'. Switch to '$TARGET_BRANCH' before syncing." >&2
  exit 1
fi

local_sha="$(git rev-parse HEAD)"
upstream_sha="$(git rev-parse "$UPSTREAM_REMOTE/$TARGET_BRANCH")"

if [ "$local_sha" = "$upstream_sha" ]; then
  echo "Already up to date with $UPSTREAM_REMOTE/$TARGET_BRANCH ($upstream_sha)."
  exit 0
fi

if ! git merge-base "$local_sha" "$upstream_sha" >/dev/null 2>&1; then
  echo "This repository has unrelated history from $UPSTREAM_REMOTE/$TARGET_BRANCH." >&2
  echo "Use a separate clone for x-algorithm instead of fast-forwarding this repo." >&2
  exit 1
fi

if git merge-base --is-ancestor "$local_sha" "$upstream_sha"; then
  git merge --ff-only "$UPSTREAM_REMOTE/$TARGET_BRANCH"
  echo "Fast-forwarded to $UPSTREAM_REMOTE/$TARGET_BRANCH ($upstream_sha)."
  exit 0
fi

echo "Local '$TARGET_BRANCH' has commits not in $UPSTREAM_REMOTE/$TARGET_BRANCH." >&2
echo "Resolve manually (rebase or reset) before running sync." >&2
exit 1
