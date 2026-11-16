# enrich-gaps-1f progress

Status: COMPLETE. All 45 input companies have a record in `enrich-gaps-1f.json`.

Method: companies 0-9 were researched with WebSearch and WebFetch. During #5-6 the session's WebSearch budget ran out (2000/2000). Companies 10-44 used only the companies' own sites, fetched or scraped (home, about, team, contact, privacy and imprint pages), plus Companies House. Other search engines were not used to get around the limit.

Work files: `enrich-gaps-1f.work/` contains the `f1..f5.json` findings, `findings.json`, `build.py` (input + findings -> output), `scrape.py` and `text.py` (site scrapers), and `stats.py`.

Gains (non-DNT companies): +4 decision makers, 6 companies with new personal LinkedIn, +7 company LinkedIn, +8 phone, +10 email, +15 second contacts.
DO_NOT_TARGET: Centric Digital (site says no longer active as of 2025).

Flags to verify: BokDoc (domain has no DNS), Panorama Environmental (joined Spheros Environmental), Tekna (acquired by Re:Build 2022, still operating), Sales Generation (site is now a bare landing page; founder on Railforge AI), Bertholf Ventures (site down), Koin Limited (site placeholder).

Left undone, needs search: personal LinkedIns for most contacts; decision makers for Kyra Labs, StaffRight, YLD and Sourcing Squad HQ; anything for PangeaTwo, TriStarr, CFS and Sidetrade (sites return 403); in-role checks for contacts that were carried over.
