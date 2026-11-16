# discover-casestudies-b progress

Single worker (subagent launch hit the concurrency limit). Output: v3/raw/discover-casestudies-b.json
Build: `python3 v3/raw/discover-casestudies-b.build.py` merges v3/raw/discover-casestudies-b.src/*.py (one per vendor).
Method: curl sitemaps + /tmp/csb/ft.py text extract, Wayback CDX for removed stories, WebSearch for enrichment.

NOTE: WebSearch session limit hit during Monitask (resets 8:40pm Asia/Karachi). After that, enrichment
is from company websites via curl only (contact pages); decision makers for later vendors may be sparse.

## Done
- ActivTrak (15): case_studies-sitemap (15; 8 anonymous skipped), blog sitemap, Wayback /blog/, featuredcustomers, logos.
- Teramind (32): case-studies + client-stories sitemaps (19 stories; ~9 anonymous skipped), customers page videos
  (Thakeham, Abussi, SalesGeneration.ai, Arrivia), homepage "Trusted by" logo wall (2026).
- Veriato (8): /case-studies/ (17; ~9 anonymous), Wayback PDFs (Ashton Financial, DANCEL). All 2016-era.
- Controlio / Work Examiner: only anonymous reviews — no records.
- Monitask (1): homepage/industry testimonials; only FBA Prep 4U named.

- Kickidler (en/ru/br/es/tr sitemaps; ~20 'client case' posts) and KeepActive: all anonymous — no records.
- ProHance (31): prohance.ai case_study.xml (49 URLs; named ones from slugs) + testimonials.php (40 named people) + logos.
- Prodoscore (22): site behind Cloudflare; Wayback CDX of /resources/case-studies/ (32) read via Wayback.
- Sapience: all case studies anonymous (current + Wayback) — no records.
- TimeCamp (12): /customer-stories/ (8 live, 4 removed: Havas, Saatchi, Raindrop, Tense).
- Apploye (23): /customer-stories (9 named, 9 anonymous) + homepage logos; Grammar Electrical FORMER Hubstaff record.
- Traqq: only first-name testimonials — no records.
- WebSearch quota reset; enrichment resumed from TimeCamp onward.

- Workstatus (11): case-study pages (now anonymized; named 2025 versions on Wayback) + homepage testimonials.
- EmpMonitor (25): /case-study/ (8; 4 named) + logo-wall image (read visually) + testimonials page (placeholder reviewers).
- Flowace (21): /case-studies/ (17; 8 named) + homepage logos; Leadzen.ai FORMER Time Doctor record.
- CurrentWare (14): customers-sitemap (24 stories; 14 named).
- Monitask: added 2 companies named in CEO Capterra reviews (Faes & Co, MyBikeMx; both in known list).

## Status: COMPLETE (219 records). Build: python3 v3/raw/discover-casestudies-b.build.py
Known gaps: no Prodoscore/Teramind press-release sweep; logo-only records mostly not enriched; YouTube
videos checked only for Teramind; vendor LinkedIn posts not swept; ProHance case-study PDFs (gated) not read.
