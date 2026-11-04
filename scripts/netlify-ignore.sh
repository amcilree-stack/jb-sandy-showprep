#!/usr/bin/env bash
# Netlify build "ignore" hook: exit 0 = skip build, exit 1 = build.
# Skips only when the commits since the last deploy changed nothing but "Updated … CT" stamps.
OLD="${CACHED_COMMIT_REF:-}"; NEW="${COMMIT_REF:-HEAD}"
if [ -z "$OLD" ] || [ "$OLD" = "$NEW" ] || ! git cat-file -e "$OLD^{commit}" 2>/dev/null; then exit 1; fi
if bash "$(dirname "$0")/stamp-only.sh" "$OLD" "$NEW"; then echo "Only timestamps changed; skipping deploy."; exit 0; fi
exit 1
