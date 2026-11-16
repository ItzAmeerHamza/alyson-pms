# reval-theirstack-generic — progress

Input: v3/batches/theirstack-generic.json (671 rows; Toggl is 77 not 78 in file).
Rows with 10–2,500 employees under real-product techs: 200 (input indexes listed by script).

## Detection method (TheirStack)
TheirStack technographics come from keyword matches in job-posting text (355k+ job sources);
each detection links back to a job post. Public tech pages show no job counts/dates.
So a "technology" whose name is a common English phrase gets matched by ordinary job-ad text.

## Early observations
- Timesheets (TheirStack says 5,086 cos, vendor timesheets.com): sample = Accenture, ABB, Maersk,
  Fujitsu, State of Florida, CBRE... -> the word "timesheets" in job ads ("submit/approve timesheets").
- Time Analytics (940 cos, vendor timeanalyticssoftware.com, a small Balkan SMB product): sample =
  EY, IBM, Infosys, TCS, KPMG, Halliburton, data/BI consultancies -> substring of "real-time analytics".
- My Hours: generic phrase ("my hours"); sample = YMCA, CA Dept of Social Services, restaurants.
- Time Cop: Modus Create, SAIC -> likely Ruby `timecop` gem in dev job ads.
- Kimai: one hit is "Kimaï" jewelry brand (name collision).
- HourStack: Tire Rack / Discount Tire / Power Digital — to verify.

## Status: DONE (2026-10-05)
- All 200 mid-size real-product rows validated (generic-parts/batch-01..09 + batch-10-contacts patch).
- Output rebuilt by `python3 generic-parts/merge.py` -> reval-theirstack-generic.json
  (686 records = 671 companies + 15 __TECH_VERDICT__ records). Stats: `python3 generic-parts/stats.py`.
- Companies: DO_NOT_TARGET 412, POSSIBLE 236, CURRENT 15, PROBABLE 7, FORMER 1.
- Rules: Timesheets / Time Analytics / Time Cop / My Hours (unchecked rows) -> DO_NOT_TARGET;
  real-product rows outside 10–2,500 -> POSSIBLE low priority (coordinator decision).
- Left undone: phones/emails for several CURRENT rows; Glassdoor/Workable pages that 403'd used via snippets.

## Generic spot-checks (done)
Timesheets checks: Maersk (no product mention), Wharton-Smith (assistant super "timesheets" duty),
The Logistics Company (record hours duty), Ferguson-Florissant SD (own paper/xls timesheets),
Akkodis (consultants submit timesheets to agency), Division 15 Mechanical & OCL Group (foreman
paperwork "Timesheets"), Humanforce (itself a WFM/timesheet vendor), HeroCoders (makes Clockwork
timesheets app for Jira), timesheets.com logo wall (Spectrum Eye Care, Wordsmith Pros, Moneypenny...)
matches none of the 236 names. VERDICT: generic word; FP ~99%+.
Time Analytics checks: VeloDB (real-time analytics DB vendor), Lingaro (MS Fabric Real-Time Analytics),
Celebal (real-time reporting), Afterpay (data roles), Orb (real-time usage analytics), Irisity (video
analytics), list dominated by data/BI consultancies + EY/IBM/KPMG. Vendor is a small SMB tool.
VERDICT: substring of "real-time analytics"; FP ~99%+.
Records helper: generic-parts/add.py appends to generic-parts/validated.jsonl (keyed by input_index).
