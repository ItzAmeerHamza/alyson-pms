# discover-jobs progress (FINAL for this run)
Batches: raw/discover-jobs.work/b01-b08.json (OJ batches built from sNN.json via build_oj.py using oj_sel.json indexes).
Merge: `python3 raw/discover-jobs.work/merge.py` -> raw/discover-jobs.json (108 records)

## Sources done
- WebSearch site: queries onlinejobs/greenhouse/lever/workable/bamboohr/ashby (b01) - greenhouse/lever/ashby/bamboohr returned nothing useful
- jobs.workable.com public search API, all 20 vendors + generic phrases (wsearch.py, wsearch2.py) (b02)
- himalayas.app search API, all vendors + phrases (hsearch.py) (b03)
- onlinejobs.ph site search via curl, all vendors (oj.py -> 1199 jobs, 631 recent with vendor hit); named employers b04-b08
- remoteok API (no hits)
## Not done / blocked
- WebSearch session budget (2000) exhausted -> ~30 new OJ companies have evidence but no outreach enrichment ("Enrichment pending" in notes)
- JobStreet PH returns 403 to curl/WebFetch; rozee/naukri/linkedin/indeed not searched
- Think Visa Philippines (coordinator lead) could not be verified - no record written
- Pre-2025 OnlineJobs postings not recorded (e.g. many 2021-2024 hits in oj_hits.json)
- ~370 recent OJ postings with vendor hits are anonymous (employer hidden) - skipped
