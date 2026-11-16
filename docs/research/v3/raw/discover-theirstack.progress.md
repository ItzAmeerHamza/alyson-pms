# discover-theirstack progress (COMPLETE 2026-10-05)

Scripts are in `v3/raw/work-ts/`:
- `ts.py` fetches and parses pages (with a cache)
- `scrape.py` reads each tech's main page and the slices it links to
- `scrape2.py` probes about 100 country codes and 35 zones per tech; a slice counts only if its title says "in <X>"
- `build_discover.py` writes the output, merging `validated.json`
- `build_competitors.py` and `vendors_data.py` write competitors.json
- Raw scrape: `scraped2.json`

## Key finding
A TheirStack slice `/en/technology/<slug>/<cc>` is real only when the page `<title>` says
"... in <Country> (n)". An unsupported slice silently returns the GLOBAL top-10 page, so earlier rows built from
such URLs repeat the same 10 companies with wrong country labels.
`?page=N` is ignored, so each real page shows at most 10 companies.
The public pages never show jobs count, first/last detected dates or confidence.

## Done
- [x] Employee Monitoring category (39 techs) plus other HR subcategories
- [x] Grepped all 5 tech sitemaps for vendor slugs. Many brief vendors have no TheirStack tech (listed in competitors.json notes)
- [x] 46 techs; 3,363 slice probes; about 1,380 real-page company/vendor pairs; 838 skipped because the name is in known-companies.txt
- [x] 551 new records written: 545 POSSIBLE (390 of them on generic-word techs at confidence 30), 2 PROBABLE, 4 DO_NOT_TARGET
- [x] Validation of the 26 target companies (25-2,500 employees; agency/IT services/BPO/outsourcing). Validated: webdew (Time Doctor),
  Thinkingbox (Harvest/Forecast), Movement Strategy (Harvest/Forecast, weak). SPICA = vendor of My Hours, so DO_NOT_TARGET. VASL = Iran (sanctions).

## Left / caveats
- First/last detected dates, jobs count and TheirStack confidence need a TheirStack login or the API.
- Most core-vendor (Hubstaff/Time Doctor/Toggl/Replicon...) companies on real pages were already in known-companies.txt.
