# Show prep site: how it works

Content lives in `data/`; the pages are generated. The root `index.html` is the Grok air board (pushed daily by amcilree-stack) and must never be written by these scripts. The generated Today/Ideas/Audio page is `today/index.html`. Don't hand-edit generated pages.

| File | What it is |
|---|---|
| `data/stories.json` | Stories from the stories doc (`first_seen`, optional `stale` reason) |
| `data/ideas.json` | Show Ideas doc items, newest first (`added`, links, social video links) |
| `data/audio.json` | Every clip. `origin: ideas-doc` = made from doc links; `library` = the old edited-audio set |
| `data/seen-blocks.json` | Fingerprints of doc lines already handled, plus the stories-doc hash, used to spot new items and to tell when the doc hasn't changed |
| `data/legacy.json` | Every card from the old one-page site (archive only) |

Rules (in `scripts/build.js`):
- Anything older than 7 days goes to the archive. So does anything with a `stale` reason (a past event or occasion). Nothing gets deleted.
- Ideas from the last 3 days get the "New" badge. The rest of the week shows under "Earlier this week".
- If the stories doc hasn't changed since the last check, the front page says "No new stories today".
- To pull an item off the front page, add `"stale": "reason"` to it in the JSON and rebuild.

Commands:
```
scripts/publish.sh --dry-run          # export docs, detect new, extract audio, build; no commit
SHOWPREP_GITHUB_TOKEN=... scripts/publish.sh   # same, then commit and push to main (Netlify deploys)
node scripts/build.js [--today YYYY-MM-DD]     # rebuild pages only
python3 scripts/preview.py             # local server + full-page screenshots (preview-*.png, git-ignored)
```
Netlify still runs `node scripts/apply-basic-auth.js` as its build step. Never run it locally before committing.
Audio lives once under `audio/`. `_redirects` keeps the old `edited-audio/...` and root `.mp3` links working.
