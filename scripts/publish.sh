#!/usr/bin/env bash
# Publish the show-prep site:
#   1) export both Google Docs        2) detect new stories + ideas (data/seen-blocks.json)
#   3) extract audio for new links    4) regenerate the pages
#   5) commit and push to GitHub using SHOWPREP_GITHUB_TOKEN (Netlify deploys from main)
#
# Usage:  SHOWPREP_GITHUB_TOKEN=... scripts/publish.sh
#         scripts/publish.sh --dry-run     # steps 1-4 only, shows what would be committed
# Options: --today YYYY-MM-DD (override the date)   --no-pull (skip syncing with origin first)
# The token is only passed to git as a one-off HTTP header; it is never written to .git/config or the remote URL.
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0; PULL=1; TODAY_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --no-pull) PULL=0 ;;
    --today) TODAY_ARGS=(--today "$2"); shift ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
  shift
done

BRANCH="${SHOWPREP_BRANCH:-main}"
REMOTE_URL="${SHOWPREP_REMOTE:-https://github.com/amcilree-stack/jb-sandy-showprep.git}"
TOKEN="${SHOWPREP_GITHUB_TOKEN:-}"

git_auth() {
  # Run git with the token as a header for this one command only (keeps it out of config, URLs and logs).
  local basic
  basic=$(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')
  git -c credential.helper= -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}" "$@"
}

if [ "$DRY" = 0 ] && [ -z "$TOKEN" ]; then
  echo "SHOWPREP_GITHUB_TOKEN is not set. Run with --dry-run to build locally without pushing." >&2
  exit 2
fi

echo "== 1-2) export docs + detect new stories and ideas"
node scripts/sync-docs.js "${TODAY_ARGS[@]}"
echo "== 3) extract audio for new social video links"
node scripts/extract-audio.js "${TODAY_ARGS[@]}"
echo "== 4) regenerate pages"
node scripts/build.js "${TODAY_ARGS[@]}"
# Note: scripts/apply-basic-auth.js is Netlify's build step. Don't run it here; it would write credentials into _headers.

git add -A
if git diff --cached --quiet; then
  echo "Nothing changed; nothing to publish."
  exit 0
fi

# Skip pushes that only refresh the "Updated … AM CT" stamp. During-show runs
# every 6 minutes would otherwise flood the repo with empty commits.
STAGED=$(git diff --cached --name-only)
if [ "$(printf '%s\n' "$STAGED" | grep -cvE '^(index\.html|jb-sandy-showprep\.html)$' || true)" = "0" ] \
   && [ -n "$STAGED" ]; then
  NONSTAMP=$(git diff --cached -U0 -- index.html jb-sandy-showprep.html 2>/dev/null \
    | grep -E '^[+-]' | grep -vE '^(--- |\+\+\+ )' \
    | grep -cvE '^[+-]<p class="stamp">Updated ' || true)
  if [ "${NONSTAMP:-0}" = "0" ]; then
    echo "Only the page timestamp changed; skipping commit."
    git reset --quiet
    exit 0
  fi
fi

SUMMARY=$(node -e '
const r = require("./.cache/sync-result.json");
const parts = [];
parts.push(r.stories_changed ? `${r.new_stories.length} new stories` : "stories doc unchanged");
parts.push(`${r.new_ideas.length} new ideas`);
console.log(parts.join(", "));')
MSG="${SHOWPREP_COMMIT_MSG:-Publish $(TZ=America/Chicago date '+%a %b %-d %-I:%M %p CT'): ${SUMMARY}}"
git --no-pager diff --cached --stat | tail -15

if [ "$DRY" = 1 ]; then
  echo "== dry run: would commit \"$MSG\" and push to $BRANCH. Unstaging."
  git reset --quiet
  exit 0
fi

echo "== 5) commit + push"
git -c user.name="${GIT_AUTHOR_NAME:-JB Sandy Showprep}" -c user.email="${GIT_AUTHOR_EMAIL:-showprep@howaboutodetosausage.com}" commit --quiet -m "$MSG"
if [ "$PULL" = 1 ]; then
  git_auth fetch --quiet "$REMOTE_URL" "$BRANCH"
  if ! git merge-base --is-ancestor FETCH_HEAD HEAD; then
    echo "origin/$BRANCH moved since our last sync; these files changed there:"
    git --no-pager diff --name-only HEAD...FETCH_HEAD | sed 's/^/   /'
    # Our freshly generated pages win on conflicts (-X theirs = the commit being replayed, i.e. ours).
    if ! git -c user.name="${GIT_AUTHOR_NAME:-JB Sandy Showprep}" -c user.email="${GIT_AUTHOR_EMAIL:-showprep@howaboutodetosausage.com}" rebase --quiet -X theirs FETCH_HEAD; then
      git rebase --abort 2>/dev/null || true
      echo "Rebase failed. Your commit is still local; nothing was pushed." >&2
      exit 3
    fi
  fi
fi
git_auth push --quiet "$REMOTE_URL" "HEAD:$BRANCH"
echo "Pushed: $MSG"
