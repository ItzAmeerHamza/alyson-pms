# enrich-gaps-1b progress

- Input: v3/batches/enrich-gaps-1b.json (45 companies, indexes 0-44)
- Work dir: raw/enrich-gaps-1b.work/ (data*.py = per-index overrides; build.py writes raw/enrich-gaps-1b.json; stats.py = gain counts)
- The WebSearch budget ran out at index 6 (JLL). From there, only the company's own site was fetched
  (direct, or rendered via r.jina.ai) plus LinkedIn company pages linked from the site or already in the input. No other search engines.
- DONE: all 45 records written.
- Need a manual web search (no site or no names on site): Maxx Solutions (no domain), TRG (no domain),
  The A Career (no decision maker), JLL (Edgerton left; replacement head of JBS needed), JiBe (site down),
  Sleek Consulting (JS-only site), ASG Platform / ManVision / PlanetArt / IGENIEUX (no executives on site).
