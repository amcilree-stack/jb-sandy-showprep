# Daily air board routine (Sandy Show Bot)

Schedule: 4:28 AM America/Chicago, Monday through Friday. (History: the old writer landed at 4:42-4:43 AM CT. Run earlier so nothing races it, and so prep is ready.)
Goal: regenerate the howaboutodetosausage.com air board (root `index.html`) for today, same design and structure as before, with EVERY Story We Love and Care Don't Care item in the new format. You are the only writer of the air board. Do not ask questions; do the work and finish with a short summary.

## 0. Setup
- Repo: https://github.com/amcilree-stack/jb-sandy-showprep, branch `main`. Push with the showprep token in env `SHOWPREP_GITHUB_TOKEN`, passed to git only as a one-off header, never saved in config, remote URL, logs or the summary:
  `git -c credential.helper= -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $(printf 'x-access-token:%s' "$SHOWPREP_GITHUB_TOKEN" | base64 | tr -d '\n')" <fetch|push> https://github.com/amcilree-stack/jb-sandy-showprep.git main`
- Work in a fresh clone or `/workspace/site-redesign` after `git fetch` and `git reset --hard origin/main` (stash nothing important; the repo is the source of truth). Commit as `JB Sandy Showprep <showprep@howaboutodetosausage.com>`.
- Today = the America/Chicago date. Pretend to know nothing the sources do not say.

## 1. Files you may and may not touch
- You may edit ONLY root `index.html`. Exactly these blocks change: `const boardDate`, `const storyPool`, `storyPool.push(...)`, `const kickerPool`. Optionally `fallbackDocs` and the doc-line rule below.
- NEVER touch `/today/`, `jb-sandy-showprep.html`, `prep/`, `data/`, `archive/`, `stories/`, `m2w/`, `no-calls.html`, `scripts/`, `assets/`, `_headers`, `_redirects`, `netlify.toml`. The showprep publisher (scripts/publish.sh, author "JB Sandy Showprep") owns those and never writes root index.html. Do not run it.
- Do not change CSS, the draw() layout, the Shuffle pickers, the M2W weeks, seasons, the 6:10 fixed row, the 7:05/8:10 rows, Doc rows, phones rows, or localStorage keys. Preserve all markup and JS exactly. The title must stay `JB &amp; Sandy · Air board` and the brand `JB &amp; Sandy`; use `&amp;` (an earlier writer broke it with a bare `&`).
- Never commit a near-empty or truncated index.html (on Oct 11 a bad write replaced the whole file with ~11 bytes). Always edit the existing file in place and sanity check before pushing (section 6).

## 2. Board structure (what you are regenerating)
The page is a script-driven board. Rows: 6:00 hour: 6:00 intro, 6:10 FIXED text "Replay Story We Love From 9:35 The Previous Day" (static, no Shuffle, no story; never put a story in 6:10), 6:25 Replay, 6:35 Tease, 6:40 Care Don't Care (4 kickers), 6:52 Last Laugh. 7:00 hour: 7:05 Story We Love (s705), Minute to Win It (m2w), 7:26 Doc bit d1, 7:32 phones, 7:40 Doc bit d2, 7:52 Last Laugh. 8:00 hour: 8:05 tease, 8:10 Story We Love (s810), 8:26 d3, 8:32 phones, 8:40 d4, 8:52 Last Laugh.

Data you write each day:
1. `const boardDate = "YYYY-MM-DD";` set to today.
2. `const storyPool = [ ... ];` Story We Love pool, at the top level. Each day previously had 3 to 7 items (Oct 8: 6, Oct 9: 3, Oct 11: 7 with 3 more via push). Write 7 to 9 fresh items. The 6:10 row is fixed text and never shows a story. Item 1 = the 7:05 story and item 2 = the 8:10 story by default (item 0 is still in the pool for Shuffle; order determines defaults, with no Shuffle clicks; the board guarantees three different stories, and Shuffle never shows the same story in two slots), so put the best three first, with three distinct titles and ids, mix of Local Austin and fun. These are items for today: events today/this weekend, new local news, positive/fun stories. Austin and Texas first. No politics, crime or activism.
3. `storyPool.push( ... )` block (the Shuffle picker pool, after the `storyCats` array): add 2 to 3 items per category for the five categories `local`, `country`, `movies`, `lifestyle`, `weird` (about 15 to 20 items total). Every item needs `cat`. Items must be current (released this week, happening today or soon, or in the news in the last 3 days). Drop anything past its date. Keep the `storyCats` array and the `.forEach` line as is. Items in the top storyPool without `cat` default to `local`.
4. `const kickerPool = [ ... ];` Care Don't Care pool: 4 items (the board shows 4 in the 6:40 panel, the Shuffle picker pulls from the pool). Short odd/fun/weird news from the last 3 days, each with its own source page. Prefer 6 to 8 so Shuffle has spares.
5. Doc bits (the 4 Doc rows, Show Ideas Doc 1DT2dLgDE7Hg_TdkzAmNEQKpL1m89vXj6-RyxtHeQQvw) are NOT written by you daily. The page loads `/data/ideas.json` at view time (kept by the showprep publisher) and merges it into `docPool` (starts from `fallbackDocs`). Leave `fallbackDocs` alone. The stories Google Doc (1Ne3xytvS0dxznA65lRRhipuknnxC3ejBopajqSJPhrI) feeds `/today/` only, not the air board. You may read it as a hint for topics but never copy it into the board without checking a source page.

Doc export URL pattern if you want to read either doc: https://docs.google.com/document/d/<id>/export?format=txt

## 3. New format for every Story We Love and Care Don't Care item
Fields (see AIR_BOARD_STORY_FORMAT.md, same as the Ballet Austin TWO item in the live file):
- `id` (short kebab-case, unique across both pools), `cat` (story items only).
- `headline`: plain headline that states the key fact. For Story We Love, Title Case with the key number or fact (example: "Ballet Austin TWO Does A Family Ballet Today, And Every Ticket Is $25").
- `lede`: one line, key fact plus who reported it ("according to ...") when natural.
- `bullets`: array of exactly 2 short bullets, the next most useful facts. Real numbers only if the story has them; otherwise plain words at similar length.
- `source`: publisher name only (no URL, no parentheses). `url`: exact article page (not a home page, calendar or tag page; if the only source is a hub page, find the specific article).
- `longHead`: "The Full Story:".
- `long`: several paragraphs separated by a blank line (`\n\n`), plain conversational language, accurate to the source page only. Add a bold-label breakdown at the end ("- Label - text" lines) ONLY when the story has natural parts; otherwise flowing paragraphs only. Decide per story.
- Also keep `title` (short, used by the 7:05 and 8:10 row labels and the Shuffle picker), plus short `read` and `phone` lines (the old-style prompt: `phone` is a one-line question to ask callers) so pickers work. For kickers also keep `line` (one-line tease used in the 6:35 tease row and picker) and `more`; add `headline`, `lede`, `bullets`, `source`, `url`, `longHead`, `long` as above.
- No dashes anywhere in writing except the "Label - text" bullet pattern. No em dashes. Avoid semicolons. Plain, short sentences a radio host can read aloud.
- Markdown-ish allowed in `bullets`/`long`: blank lines between paragraphs, "- " for bullets, `**bold**`, `[text](url)`.
- Write the strings as valid JS: use double-quoted strings, escape `"` and newlines (`\n\n`). Use straight apostrophes inside strings freely.
- Do not use the old shape (title/read/phone/long only) for any new item. Do not add facts, numbers, quotes or opinions that are not on the source page. Do not invent URLs.

Example (copy the shape; this one is live):
{ id: "ballet", cat: "local", headline: "...", lede: "...", bullets: ["...", "..."], longHead: "The Full Story:", title: "...", read: "...", phone: "...", source: "...", url: "https://...", long: "para1\n\npara2\n\n- Label - text" }

## 4. How to find and verify stories
- Sources used before: Austin Monthly, Austin American-Statesman, KVUE, Visit Austin, ATX Things, OnesToWatch, Austin Chronicle, Songkick, Ticketmaster, UPI Odd News, Guinness World Records, ABC News, The Examiner, Hillbilly Live, Hank FM, Box Office Mojo, IFIC, Health.com. Add others as needed.
- Search the web for today's Austin events and news, country music news, movies (box office, releases), lifestyle, weird news (last 3 days). Pick items a morning radio show can use today.
- For EVERY item, fetch the actual source page (WebFetch, or curl as fallback) and write only from what is on it. If a page cannot be fetched or does not support the claim, drop the item and find another. Confirm dates ("today", "Saturday") against today's date; rewrite relative words ("today", "tonight") correctly for the board date.
- Do not repeat yesterday's items unless still genuinely current; check `git show HEAD:index.html` for yesterday's ids and titles to avoid reruns, and refresh any carried-over item into the new format with a re-fetched source page.
- Remove past-date items (events that already happened, expired deals). Check the doc/season rules are untouched.

## 5. Weekday and holiday handling
- Run Monday to Friday. If a Saturday or Sunday run is requested, treat it like any other day but prefer weekend events.
- Mondays: also check that `m2wWeeks` includes the current week (it covers through 2027-02-12); if the date is past it, only mention it in the summary.

## 6. Verify before pushing
Run these on the edited local file; stop and do NOT push if any fails:
1. File size > 40 KB and contains `<div id="board"></div>`, `function draw()`, `fetch("/data/ideas.json")`, and `</html>`.
2. Extract the `<script>` body and run it with `node --check` (put it in a temp .js file). It must parse.
3. Count: 7 to 9 items in the top storyPool, 15 to 20 in the push block, at least 4 kickers; every one of them has headline, lede, bullets (length 2), source, url, longHead, long, title, and unique id; every story has a valid `cat` among local, country, movies, lifestyle, weird.
4. No item still in old-only shape. No bare `&` in `<title>` or `.brand`. `boardDate` equals today.
5. `git diff --stat` shows only index.html; `git diff` outside the data blocks (boardDate, storyPool, push block, kickerPool) must be empty.
6. Optional: render with a headless browser at desktop width, open the 7:05 card and confirm 6:10 still reads the fixed replay text with no Shuffle and Longer read, confirm no JS error.

## 7. Commit and push (only if content changed)
- If the new index.html is identical to origin/main, or only boardDate changed, do nothing and say "No change".
- Otherwise commit with this exact message style (matches history): `<Weekday> <Mon> <D> air board: <3 short topic names>` for example `Monday Oct 12 air board: Hot Luck, ACL recap, Clayface`. Commit as JB Sandy Showprep, push to `main` (fast-forward; if the push is rejected, fetch, rebase onto origin/main, re-verify, push once more; never force push).
- Never use `--no-verify`, never force push, never touch other files, never create branches.

## 8. Verify live
- Wait about 60 to 90 seconds for Netlify to deploy, then: `curl -s https://howaboutodetosausage.com/ | grep -c 'const boardDate = "<today>"'` should be 1, and `curl -s https://howaboutodetosausage.com/ | grep -c 'longHead: "The Full Story:"'` should be at least the number of new-format items (about 20 or more). Also `curl -sI https://howaboutodetosausage.com/today/ | head -1` should still be 200. Retry up to 3 times, 60 seconds apart. Sandy's site is public on that domain; if curl needs Basic-Auth and returns 401, report that instead of failing the run.
- Never print or log the token.

## 9. Final summary (max 8 lines)
Date, commit hash or "No change", the two default Story We Love titles (7:05, 8:10), the 4 default Care Don't Care lines, counts (stories, push pool, kickers), anything dropped because a source could not be fetched, and the curl check results. Flag any problem plainly.

## 7. Anytime button (preserve)
Root `index.html` has a static block between `<!-- ANYTIME BUTTON START (preserve) -->` and `<!-- ANYTIME BUTTON END -->`, directly above `<div id="board">`: the full-width button labeled "Unknown Poll Generator" (class `anytime-btn`, id `anytime-btn`) and its hidden panel `#anytime-panel` titled "Anytime", plus the `.anytime-btn` CSS rules. This is outside draw(). Never remove, rename or move it (the label stays exactly "Unknown Poll Generator"), and keep its CSS. After editing, confirm both markers and `id="anytime-panel"` are still in the file before pushing. Edit only the data blocks listed in section 1.

## 8a. Unknown Poll Generator pollPool (rewrite every weekday)
The Anytime panel's first section is the Unknown Poll Generator. Its code sits between `// POLL GENERATOR START (preserve)` and `// POLL GENERATOR END` inside the main script, plus `<section class="any-sec" id="sec-polls">` with `#poll-shuffle` and `#poll-list` inside `#anytime-panel`. Keep all of that code, markers and ids exactly. Each morning rewrite ONLY the `const pollPool = [ ... ];` array in that block with a fresh pool of about 15 polls (14 to 16), and keep the localStorage keys (`air-poll-never`, `air-poll-used`, `air-poll-recent`, `air-poll-shown`, `air-poll-now`) and the Use Now / Already Used / Never / Shuffle behavior untouched.
- Voice: short, radio-ready, casual, clean, light-hearted, relatable for a 25-54 country audience, no politics. Simple conversational wording that can be read on air with almost no editing. Each poll fits a 20 to 40 second bit.
- Content: real recent U.S. adult surveys from the last 36 months (similar English-speaking countries only if needed). Quirky "would you", preference or silly-behavior percentages. Find them with WebSearch/WebFetch (Talker Research, NRF, etc.), use the real numbers from the page, and never invent a poll. If a number must be approximated to fill a card, put "approx." next to it. Prefer concrete percentages, but a non-percent stat is fine when it is in the source.
- Fields per poll object, exactly: `id` (unique, starts with "p-"), `headline` (short punchy line), `stats` (array of 2 to 4 short strings with percentages; up to 5 only when the source supports it), `source` (like "Talker Research, 2,000 U.S. adults, Sept 2026"), `closer` (optional one-sentence radio-friendly reaction; use "" if none), `theme` (one lowercase word: halloween, thanksgiving, christmas, sleep, food, pets, etc.).
- Holiday logic: if today is within about 3 to 4 weeks of a major holiday (Halloween, Thanksgiving, Christmas, New Year's, Valentine's Day, July 4th, etc.), at least half of the pool is themed to that holiday (`theme` = that holiday). Otherwise stay fully general. Prioritize variety: different themes and different stats, no near-duplicates, and do not reuse polls that were in the previous pool unless fewer than 15 fresh ones can be verified.
- Escape quotes inside strings. No extra commentary, no "want more?" lines inside the data.
- Verify: node --check passes, 14 to 16 polls, unique ids, every poll has headline, 2-5 stats, source, theme; the markers, `#sec-polls`, `#poll-shuffle`, `#poll-list`, and `id="anytime-panel"` are still present.

## Source display rule
Keep writing `source` (publisher name only) and `url` as separate fields on every story, kicker and (optionally) poll. The board shows "Source: <name>" with the name itself as the link to `url` (new tab, rel noopener) and never displays the raw URL. Never put raw URLs in any visible text (headline, lede, bullets, long, closer); use `[text](url)` only if a link inside text is truly needed. Do not change the sourceLine/newFormatLines/srcLink rendering code in index.html when rebuilding.

## Site is behind HTTP Basic Auth
howaboutodetosausage.com is protected by a Netlify Edge Function (user SausageLover). Any verification curl must use `-u "SausageLover:$SITE_BASIC_AUTH_PASSWORD"` (env var on the box; never print, echo, log or commit it). Git pushes are unaffected. `netlify/edge-functions/auth.js` and the `[[edge_functions]]` block in `netlify.toml` must be preserved. Do not remove or overwrite them in rebuilds.

## 6:10 fixed slot (Sandy, Oct 13 2026)
The 6:10 row in draw() is static text "Replay Story We Love From 9:35 The Previous Day" with no Shuffle button and no story. Never restore storyRow("6:10"...) or refill it. Before pushing, confirm `rg -c "Replay Story We Love From 9:35 The Previous Day" index.html` is 1 and there is no `storyRow("6:10"`.
