# discover-casestudies-adjacent progress

Output: v3/raw/discover-casestudies-adjacent.json — build with `python3 v3/raw/discover-casestudies-adjacent.build.py`
(merges discover-casestudies-adjacent.src/*.py, one file per vendor).
Tools in discover-casestudies-adjacent.work/: sm.py (sitemap), ft.py (text; MARK env), links.py (outbound links), ct.py (contact scan), cdx.py (Wayback first capture).
NOTE: bash commands containing the substring "git" (e.g. "digital") are blocked by the worktree guard — put URLs in a file and pass @file.
NOTE: WebSearch hit session limit early in run (resets 8:40pm PKT) — enrichment via curl only.

## Done
- Clockify (30 records): all 44 /customer-stories/ in sitemap. Skipped solo individuals/creators (Alex Beadon, Catie Fenn, Cristiana Caserta,
  Jourdan Guyton, Juan Faisal, Maria Bayley, Mordechai Lewis, Rachael McDiarmid, Rich Cardona, Taz Zammit, Xayli Barclay, Zulie Rane, Workflow Queen 3 ppl).
  /customers page only has anonymous reviews.

- Toggl Track (27 + 2 Harvest FORMER: Common Thread, Forum Communications): all 27 toggl.com/customers/* stories.
- Harvest (25): all 24 getharvest.com/customers/* + 2 Forecast stories (Work RM skipped: 1 person).

- Jibble (4 named; 24 anonymised skipped). Everhour (4 interviews + 6 testimonials). Replicon (Deltek live stories + ~65 archived replicon.com/case-study pages, brief). TrackingTime (Crowe Tijuana; 1 anonymous agency skipped).

- Timely (22 + 3 FORMER: Falk Media Harvest, Yummygum Harvest/Toggl). WebSearch BUDGET EXHAUSTED (2000/2000) after Timely — curl-only from here.
- ClickTime (37 brief), My Hours (6), Beebole (8 + Olsys Harvest FORMER), Timeero (11 + 1 anonymised utility skipped).

- Paymo (13, stale 2018-21 except Opgevallen 2023).

## Not covered / dead ends
- QuickBooks Time (TSheets): quickbooks.intuit.com blocks curl/WebFetch (404/000); Wayback unavailable — no records.
- RescueTime: team product discontinued (/teams 404); no customer stories.
- Timeular: timeular.com now redirects to TimeTac (acquired) — no stories.
- Timesheets.com: only initial-only anonymous reviews (skipped). Time Analytics: no customer stories on site.
- Anonymised stories skipped: Jibble (24), TrackingTime (1), Timeero (1), Clockify solo individuals (13).
- WebSearch budget exhausted (2000/2000) — LinkedIn personal URLs only where vendor/company pages linked them.

## Status: COMPLETE (all 18 vendors attempted). 266 records.
