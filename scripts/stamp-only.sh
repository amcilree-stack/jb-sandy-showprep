#!/usr/bin/env bash
# Usage: scripts/stamp-only.sh OLD NEW   (NEW may be "INDEX" for the staged tree)
# Exit 0 if every changed file between OLD and NEW is an .html page whose only
# difference is the "Updated <day> · <time> CT" stamp. Exit 1 otherwise (real change).
set -u
OLD="$1"; NEW="$2"
norm() { sed -E 's/Updated [^<]*CT/Updated STAMP/g'; }
if [ "$NEW" = INDEX ]; then FILES=$(git diff --cached --name-only "$OLD"); else FILES=$(git diff --name-only "$OLD" "$NEW"); fi
[ -z "$FILES" ] && exit 0
while IFS= read -r f; do
  case "$f" in *.html) ;; *) exit 1 ;; esac
  [ "$f" = index.html ] && exit 1   # air board changes always deploy
  if [ "$NEW" = INDEX ]; then n=$(git show ":$f" 2>/dev/null | norm) || exit 1
  else n=$(git show "$NEW:$f" 2>/dev/null | norm) || exit 1; fi
  o=$(git show "$OLD:$f" 2>/dev/null | norm) || exit 1
  [ "$o" = "$n" ] || exit 1
done <<< "$FILES"
exit 0
