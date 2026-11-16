# discover-casestudies-a progress

Work dir: v3/raw/discover-casestudies-a.work/ (sitemaps *.xml, urls.tsv, wayback.tsv first-capture dates,
pages/ text extracts, rec/*.json record batches -> `python3 merge.py` builds ../discover-casestudies-a.json)

## Done (166 records)
- Sitemaps for all 7 vendors + Wayback CDX first-capture dates for every story URL (incl. removed stories)
- Hubstaff: all 21 /customers + 3 /tasks/customers + removed ENCCD + FeaturedCustomers testimonials (rec/01-03)
- Insightful: all 36 stories (4 anonymous ones skipped: leading-us-bank, national-law-firm, pe-backed-software-company, from-spend-to-roi) (rec/04)
- Time Doctor: 26 resources.timedoctor.com stories + removed timedoctor.com/case-study-* (seozeo, ve-people, maritess-pasag, splashopm) + FC (rec/05). Anonymous customer-support-bpo / health-insurance skipped.
- DeskTime: all 20 + removed delonix, toastit + FC (rec/06)
- Time Champ: all 22 (rec/07)
- We360: akumin, simplify-healthcare, human-capital + removed callarity, imark, samosys, visiontrek (rec/08)
- WebWork: metaviz, igenieux, mid-construction (rec/08)

- Logo walls (Insightful/Time Champ home) rec/09; corroboration patches + domain verification in merge.py (domain_check.json)
- FINAL: 176 records written. Web search budget (2000/session) exhausted before supplementary searches.

## Left (not done)
- Supplementary web searches (testimonials on home/industry pages, YouTube, LinkedIn posts, G2 quotes w/ company names)
- Final domain verification pass
