# discover-docs-github progress

STATUS: stopped. The session's WebSearch budget (2000/2000) is used up. GitHub sweeps are complete.

Records live in raw/docsgh_work/recs_01..04.json. Run `python3 raw/docsgh_work/build.py` to merge them into discover-docs-github.json; it removes duplicates by company+vendor, and later files win. 18 records.
Helpers: ghs.py (gh code search), ghl.py (gh code search by language, skips noise owners), ghq.py (REST code search), ghgrep.py (grep one file in a repo), ghinfo.py (repo/owner info).

## Done
- Web (Phase 5): handbook/onboarding/FAQ/notion/policy phrasings for Time Doctor, Hubstaff, Teramind, ActivTrak. The search tool ignores exact phrases, so most hits were vendor marketing. Found: HackerBay handbook, Cuesoft handbook (moved, no Hubstaff now), The Virtual Hub blog, My Amazon Guy.
- GitHub (Phase 6): language sweeps for hubstaff, timedoctor, desktime, teramind, activtrak, insightful.io. API hosts searched: api.hubstaff.com, api2.timedoctor.com, timedoctor.com/api, desktime.com/api, api.insightful.io, app.insightful.io, app.activtrak.com. Env-var names searched: HUBSTAFF_ORG_ID, TIMEDOCTOR_COMPANY_ID, INSIGHTFUL_API_TOKEN, DESKTIME_API_KEY. Single-term searches: timechamp, webwork-tracker, monitask, apploye, kickidler, controlio, veriato, workpuls. Also tried: msiexec/intune/jamf combinations, handbook/onboarding + vendor.
- Rejected as noise or not a company: integration platforms (mindcloud, pipedream, composio, WYRE.AI connector, keboola, airbyte), Installomator/Homebrew/winget recipes, YARA/blocklists, personal projects, unnamed employers (QTIP, "ABC" payroll, Policies-and-Procedures), Isotech (looks like a DeskTime reseller page), JPIT (MSP), revcloud/* (our own repos).

## Left undone
- Phase 5 web searches for the adjacent vendors (Clockify, Toggl, Jibble, Harvest, Everhour, QuickBooks Time), plus filetype:pdf, docs.google.com, gitbook, scribehow, trainual and confluence variants for all vendors. These need more web-search budget.
- Enrichment gaps: Local AC (owner), Simple Biz (domain; known company, left alone), HillStreet, CodeMax, HumbleBee, The Virtual Hub, SageStone contacts.
- site:<domain> "<vendor>" checks could not be run for the new companies (search budget ran out).
