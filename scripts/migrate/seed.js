#!/usr/bin/env node
"use strict";
/* One-time seed (Oct 4, 2026): turn the two Google Docs + the old page into data/*.json.
   Usage: node scripts/migrate/seed.js <ideas.html> <ideas.txt> <stories.txt> */
const fs = require("fs");
const path = require("path");
const D = require("../lib/docs");
const ROOT = path.join(__dirname, "..", "..");
const [ideasHtml, ideasTxt, storiesTxt] = process.argv.slice(2);
const TODAY = "2026-10-04";

/* ---------- Ideas: curated table, newest (top of doc) first ----------
   [doc line prefix, title, added, body?, extra?]  est = date estimated from doc position */
const S = (x) => x;
const IDEAS = [
  ["Unknown Poll: Washing Sheets", "How long do you go between washing sheets?", "2026-10-03",
    "Sheets and towels should be every one to two weeks. A Sleep Advisor study says the average is about 24 days (25 for pillowcases). A UK study found most single men wait about four months, and 5% of people wash them once or twice a year. Phone: your honest number, and are the guest-room sheets a different story?"],
  ["Jeep people", "Jeep people audio description", "2026-10-02",
    "Describe a Jeep person without saying “Jeep”: doors off, the wave, the duck on the dash, the spare-tire cover. Listeners finish the picture."],
  ["Trail of Lights", "Trail of Lights tickets already on sale", "2026-10-01",
    "The 62nd H-E-B Trail of Lights runs Dec 10–23 at Zilker. Free nights Dec 10–11 and 13–17; paid nights $8, kids under 12 free. Phone: buying December lights in October. Organized or unhinged?",
    { links: [{ url: "https://austin.culturemap.com/news/entertainment/trail-of-lights-2026-tickets/", label: "CultureMap" }] }],
  ["m", null],
  ["MJ led Wednesday", "That is not your pet", "2026-10-01",
    "From MJ: “Can a raccoon be domesticated?” Austin version: callers whose raccoon, squirrel, deer, fox, armadillo, possum or duck started visiting and now acts like family."],
  ["What mundane activity hypnotizes you", "What mundane activity hypnotizes you?", "2026-10-02",
    "WIVK’s Joey got stuck watching construction equipment grade dirt. Austin version: tortilla machines, car washes, baggage belts, lawn robots, pressure washing, boat launches. Phone: “How long have you stood there watching?”"],
  ["Landry is a better", "Landry is a better 17-year-old than me", "2026-09-30",
    "“…That’s not saying much.” Phone: who in your house is already better at adulting than you were at that age?"],
  ["Sell us on being single", "Sell us on being single", "2026-09-30",
    "“The Single Life Tourism Board.” Callers get 20 seconds to pitch solo living; JB and Sandy pick the official spokesperson."],
  ["About 67% of gym", "67% of gym memberships go unused", "2026-09-29",
    "Unknown poll: call if you pay for a gym you barely use. Why keep it: guilt, January energy, or “I might go Thursday”?"],
  ["“They Sent Me an Uber", "They sent me an Uber", "2026-09-28",
    "Mojo: driven somewhere by a date, boss or friend, then sent home in an Uber. Sharper phone: “What happened that made someone order you an Uber and send you away?”"],
  ["“What problem do people immediately", "The problem everyone tries to solve for you", "2026-09-29",
    "Back pain, insomnia, weight, allergies, parenting, being single. Callers share the advice they’ve heard at least 100 times."],
  ["JB & Sandy Wake-Up Service", "JB & Sandy Wake-Up Service", "2026-09-29",
    "Parents secretly give three facts about the sleeping kid: nickname, unfinished chore, why they must get up. Call live and see how long before the kid realizes they’re on the radio."],
  ["Dogs and Cats are loving", "Dogs and cats are hooked on Netflix’s Sealook", "2026-09-28",
    "Pets glued to the wordless seal cartoon. Phone: what show freezes your pet?"],
  ["Rollerblading meetups", "Rollerblading meetups are a thing (JB witnessed)", "2026-09-28",
    "Phone: the weirdest adult group activity you’ve actually joined."],
  ["Someday video calls", "Someday video calls in our pocket", "2026-09-25",
    "Clip from the doc. Phone: the sci-fi thing that quietly showed up in your pocket."],
  ["“Do Your Spouse", "Do Your Spouse", "2026-09-24", null, { est: true }],
  ["Would You Vacation Without", "Would you vacation without your spouse?", "2026-09-24", null, { est: true }],
  ["What Job Would You Immediately Give", "Your Optimus gets ONE chore forever", "2026-09-24", null, { est: true }],
  ["The Job Everyone Thinks Is Awesome", "The job that looks awesome but sucks", "2026-09-24", null, { est: true }],
  ["hat Are You Genuinely Worried", "What the next generation may not know how to do", "2026-09-24", null, { est: true }],
  ["“What’s in Your Bag", "Empty Your Pockets", "2026-09-24", null, { est: true }],
  ["What news are you so excited", "News you’re excited about that nobody else cares about", "2026-09-24", null, { est: true }],
  ["What you don’t really know about my job", "What people don’t know about my job", "2026-09-24", null, { est: true }],
  ["“What thing can a six-year-old", "What a six-year-old can do that you can’t", "2026-09-24", null, { est: true }],
  ["listeners shared movie lines", "The quote nobody gets anymore", "2026-09-24", null, { est: true }],
  ["The Listener Becomes a Cast Member", "Listener becomes a cast member for a day", "2026-09-24", null, { est: true }],
  ["Tricia is convinced", "Tricia thinks Amazon played a trick on her", "2026-09-24", null, { est: true }],
  ["What got ruined for you", "What got ruined once you saw how it’s made", "2026-09-24", null, { est: true }],
  ["Toy hall of fame", "Toy Hall of Fame nominees", "2026-09-24", null, { est: true }],
  ["Social first then on air", "Three best songs about Texas", "2026-09-24", null, { est: true }],
  ["“What couple behavior", "Couple behavior that makes you suspicious", "2026-09-24", null, { est: true }],
  ["Annual Performance Review", "Annual performance review", "2026-09-23", null],
  ["“What completely insignificant household", "The tiny household issue that became a marital dispute", "2026-09-23", null, { est: true }],
  ["“Is a Birthday Text Enough", "Is a birthday text enough?", "2026-09-23", null, { est: true }],
  ["“What piece of technology would you willingly downgrade", "Tech you’d willingly downgrade", "2026-09-23", null, { est: true }],
  ["The TX Ohio St. game", "Texas–Ohio State was the most-watched regular-season game in 10 years", "2026-09-23", null,
    { est: true, stale: "Texas–Ohio State game (Aug 29) is long past" }],
  ["“What hobby makes your spouse", "The hobby that makes your spouse disappear", "2026-09-23", null, { est: true }],
  ["B & Sandy: “What phrase from your kid", "The kid phrase that makes you reach for your wallet", "2026-09-23", null, { est: true }],
  ["“That’s Where You Lost Me", "That’s where you lost me", "2026-09-23", null, { est: true }],
  ["“Have you ever gone to an open house", "Open houses with zero intention of buying", "2026-09-23", null, { est: true }],
  ["“What did somebody finally talk you into", "What did someone finally talk you into trying?", "2026-09-23", null, { est: true }],
  ["“Which Cast Members Got Arrested", "The closest you’ve come to getting arrested", "2026-09-12", null, { est: true }],
  ["Mahjong Is Suddenly Everywhere", "The hobby that suddenly got cool again", "2026-09-12", null, { est: true }],
  ["Shirley Temple in a can", "Shirley Temple in a can", "2026-09-10", null, { est: true }],
  ["Pickleball on the decline", "Pickleball on the decline", "2026-09-10", null, { est: true }],
  ["We have all NEVER met anyone", "We’ve never met anyone who works at Tesla", "2026-09-09", null],
  ["They are bringing back the GMC Jimmy", "They’re bringing back the GMC Jimmy", "2026-09-09", null, { est: true }],
  ["Halloween Tesla", "Halloween: a Tesla driving through a cemetery", "2026-09-09", null, { est: true }],
  ["Do You Study the Restaurant Menu", "Do you study the menu before you arrive?", "2026-09-09", null, { est: true }],
  ["“What store would you bring back", "What dead Austin business would you bring back?", "2026-09-08", null],
  ["“What meal did your family eat", "The struggle meal you didn’t know was a struggle meal", "2026-09-08", null, { est: true }],
  ["JB should maybe quit telling Erin", "JB should quit telling Erin “You’re gonna miss me when I’m dead”", "2026-09-08", null, { est: true }],
  ["The cybercab are officially out there", "Cybercabs are officially out in ATX", "2026-09-08", null, { est: true }],
  ["$500 ai toothbrush", "The $500 AI toothbrush", "2026-09-08", null, { est: true }],
  ["Highest/Lowest deprecating cars", "Cars that hold (and lose) value the most", "2026-09-08", null, { est: true }],
  ["We each do a coach pre game pep talk", "JB & Sandy each do a coach’s pregame pep talk", "2026-09-08", null, { est: true }],
  ["Drew Lynch walking down Euro cobblestones", "Drew Lynch vs. Europe’s cobblestones", "2026-09-08", null, { est: true }],
];

const paras = D.paragraphsFromHtml(fs.readFileSync(ideasHtml, "utf8"));
const lines = paras.filter((p) => p.text && !D.isSeparator(p.text));
const ideas = [];
let cur = null;
let ti = 0;
const startsWith = (text, pre) => pre === "m" ? text === "m" : D.normalize(text).startsWith(D.normalize(pre));
const unmatched = [];
paras.forEach((p, idx) => {
  if (!p.text || D.isSeparator(p.text)) { cur = cur && cur._blankAfter !== undefined ? cur : cur; if (cur) cur._gap = true; return; }
  const row = IDEAS.find((r) => startsWith(p.text, r[0]));
  if (row) {
    const [pre, title, added, body, extra] = row;
    cur = { id: D.slug(title || "junk-" + pre), title, added, date_estimated: !!(extra && extra.est), lines: [], text: [], links: [], body, extra: extra || {} };
    if (!title) cur.ignore = true;
    ideas.push(cur);
  } else if (!cur || cur._gap) {
    unmatched.push(p.text);
    cur = { id: D.slug(p.text), title: p.text.slice(0, 80), added: cur ? cur.added : TODAY, date_estimated: true, lines: [], text: [], links: [], extra: {} };
    ideas.push(cur);
  }
  cur._gap = false;
  cur.lines.push(D.hash(p.text));
  cur.text.push(p.text);
  p.links.forEach((l) => { if (!cur.links.some((x) => x.url === l.url)) cur.links.push(l); });
});
if (unmatched.length) console.error("UNMATCHED doc lines:", unmatched);

const audioBySource = {};
const out = ideas.filter((i) => !i.ignore).map((i) => {
  const links = (i.extra.links || []).concat(i.links).map((l) => ({ url: D.cleanUrl(l.url), label: (l.label || "").replace(/^\s+|\s+$/g, "") || null }));
  const uniq = [];
  links.forEach((l) => { if (!uniq.some((u) => u.url === l.url)) uniq.push(l); });
  const rec = {
    id: i.id,
    title: i.title,
    body: i.body || null,
    doc_text: i.text.join("\n"),
    added: i.added,
    date_estimated: i.date_estimated || undefined,
    links: uniq,
    social: uniq.filter((l) => D.isSocialVideo(l.url)).map((l) => l.url),
    doc_lines: i.lines,
  };
  if (i.extra.stale) rec.stale = i.extra.stale;
  return rec;
});
const seenLines = ideas.flatMap((i) => i.lines);

/* ---------- Stories ---------- */
const sTxt = fs.readFileSync(storiesTxt, "utf8");
const parsed = D.parseStories(sTxt);
const KNOWN = { // first time each story showed up on the site (git history) or the doc pull it arrived in
  "lone star njrotc": "2026-09-06", "nine-year-old austin": "2026-09-06", "austin educator alasin deveny": "2026-09-23",
  "gracie abrams": "2026-09-07", "donovan mitchell": "2026-09-07", "evan rachel wood": "2026-09-07", "kevin pillar": "2026-09-07",
  "college football spotlight": "2026-08-29", "volunteering for a grueling 9/11": "2026-09-06",
};
const STALE = {
  "lone star njrotc": "Past events: 9/11 Heroes Run (Sep 13) and Tiger Challenge (Sep 19)",
  "gracie abrams": "“Tomorrow’s birthdays” from the Sep 6 doc", "donovan mitchell": "“Tomorrow’s birthdays” from the Sep 6 doc",
  "evan rachel wood": "“Tomorrow’s birthdays” from the Sep 6 doc", "kevin pillar": "“Tomorrow’s birthdays” from the Sep 6 doc",
  "college football spotlight": "Texas–Ohio State preview; the game was Aug 29",
  "volunteering for a grueling 9/11": "Tied to the Sep 13 9/11 run",
  "is a 6-8% tax increase": "Tax-measure poll. The old site’s rule was no politics, so it’s off the front page (Sandy can restore it)",
};
const PAGES = { "lone star njrotc": "stories/njrotc-cadets.html", "nine-year-old austin": "stories/bin-buddies.html", "austin educator alasin deveny": "stories/deveny-heb-prize.html" };
const keyOf = (h) => Object.keys(KNOWN).concat(Object.keys(STALE)).find((k) => D.normalize(h).startsWith(k));
const stories = [];
const dupes = [];
parsed.forEach((s) => {
  const id = D.slug(s.headline);
  if (stories.some((x) => x.id === id)) { dupes.push(s.section + ": " + s.headline); return; }
  const k = keyOf(s.headline);
  const rec = {
    id, type: D.storyType(s.section), section: s.section, headline: s.headline,
    summary: s.summary || null, hook: s.hook || null, social: s.social || null,
    first_seen: (k && KNOWN[k]) || "2026-09-30",
    first_seen_note: (k && KNOWN[k]) ? undefined : "Never featured on the old site; dated to the last doc change (Sep 30)",
  };
  if (k && STALE[k]) rec.stale = STALE[k];
  if (k && PAGES[k]) rec.page = PAGES[k];
  stories.push(rec);
});

const seen = {
  note: "Fingerprints of doc content already handled. sync-docs.js treats anything not listed here as new.",
  ideas: { updated: TODAY, lines: seenLines },
  stories: { updated: TODAY, doc_hash: D.docHash(sTxt), last_changed: "2026-09-30", last_checked: TODAY, unchanged_since_last_check: true, headlines: stories.map((s) => D.hash(s.headline)) },
};

fs.writeFileSync(path.join(ROOT, "data/ideas.json"), JSON.stringify({ doc: D.exportUrl(D.DOCS.ideas, "txt"), items: out }, null, 1) + "\n");
fs.writeFileSync(path.join(ROOT, "data/stories.json"), JSON.stringify({ doc: D.exportUrl(D.DOCS.stories, "txt"), duplicates_skipped: dupes, items: stories }, null, 1) + "\n");
fs.writeFileSync(path.join(ROOT, "data/seen-blocks.json"), JSON.stringify(seen, null, 1) + "\n");
console.log("ideas", out.length, "stories", stories.length, "dupes skipped", dupes.length, "seen lines", seenLines.length);
console.log("social links:", out.filter((i) => i.social.length).map((i) => i.id + " " + i.social.join(" ")).join("\n"));
