# enrich-gaps-2b progress

Status: COMPLETE (50/50 records written to `v3/raw/enrich-gaps-2b.json`).

Method: WebSearch budget exhausted, so no search. Used company sites (home/about/team/contact/privacy/imprint) via curl
helper scripts in `enrich-gaps-2b.work/` (fx.py, kw.py, cs.py), vendor case-study pages for website links, and public
registries: OpenCorporates (US CA/FL), ProPublica Nonprofit Explorer (IRS 990 officers), Zefix (CH), Brønnøysund (NO),
Northdata. LinkedIn URLs copied only when linked from the company's own pages. `records.py` rebuilds the output.

Blocked by Cloudflare (no data): thevirtualhub.com, x.ai, wow24-7.io, builditgreen.org, localmotion.org (the last two filled from 990s).

DO_NOT_TARGET: Airborne Mobile (domain for sale), Analgesic Solutions (absorbed into WCG Clinical).

Nothing found (would need search): Showboat Hotel, Prolific Lux Motors, TicketDynamics, Dr. Robin, The Virtual Hub.
Domain still unknown: ShowMe Therapy, AmaTerra Environmental, Kenzan Media, Mountain G. Enterprises, Stakked.
