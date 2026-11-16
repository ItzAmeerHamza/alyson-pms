# enrich-gaps-1e progress

Batch: 45 companies (batches/enrich-gaps-1e.json). COMPLETE: 45/45 records written to raw/enrich-gaps-1e.json.
Staging files: enrich-gaps-1e.work/sNN.json, merged by add.py (sorted into batch order); stats.py prints gains.

Method: WebSearch was used for #1-7. The session-wide WebSearch budget ran out at #8 (Young Decade).
After that, only direct fetches of company sites, vendor case studies and public registries/Wikipedia
(WebFetch + curl). No other search engines were used.

Gains vs input: decision maker 8, new personal LinkedIn 10, phone 12, email 13, company LinkedIn 11, second contact 14.
DO_NOT_TARGET: 0.

Left undone (site blocked and/or needs search):
- R1 RCM: all fields blank (site 403; Wikipedia CEO stale)
- develeap, Aktana, H2L2: sites behind Cloudflare 403; contacts not re-verified, phone/email missing
- BrandMojo: domain unknown
- Stratcore Developments, Get Me Insurance, Ecotrips: no decision maker published on site
- TWCC: owner unnamed; no domain
- Ice Cold Spice: founder first name only ("Laura")
- Most personal LinkedIn gaps where the site does not link profiles
