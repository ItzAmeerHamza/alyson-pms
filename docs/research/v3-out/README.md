# Tavilo competitor-customer research, v3 (2026-10-05)

The earlier lists (`tavilo-competitor-customers.csv`, about 1,000 rows, and `tavilo-outreach-list.csv`,
210 rows) were treated as unverified. Every row was re-checked and seven discovery channels were searched
again from scratch. Everything comes from public sources, and each claim keeps its source URL and date.

## Files

| File | What it is |
|---|---|
| `tavilo-v3-outreach.xlsx` | Every list below as a sheet, plus "Outreach (all active)", "Unhappy with tool", "Competitors" (pricing) and "How to read". |
| `1-master-dataset.csv` | Every company + tool relationship (2,290 rows, 2,213 companies), with all brief columns plus outreach columns. |
| `2-top-50-prospects.csv` | Top 50 by Tavilo priority score, CURRENT or PROBABLE only. |
| `3-high-confidence-current.csv` | CURRENT with confidence ≥ 90. |
| `4-needs-validation.csv` | POSSIBLE rows, plus PROBABLE rows below 80 confidence, sorted by priority. |
| `5-former-customers.csv` | Companies a source says stopped using a tool; the tool they use now is in `now_tool` where known. |
| `6-competitor-summary.csv` | Per vendor: accounts, current/high-confidence counts, seats stated, top industries, common complaints, and the list price used. |
| `7-source-audit.csv` | Every raw record: which research stream found it, its evidence type, URL and date. |
| `8-channel-summary.csv` | Leads per discovery channel and per evidence type. |

## Headline numbers

- **Companies:** 2,213 unique.
  - CURRENT 367, PROBABLE 258, POSSIBLE 946, FORMER 19, DO_NOT_TARGET 623.
  - That gives 625 companies with strong evidence (CURRENT or PROBABLE), well past the 250 target.
- **Contact coverage of those 625:**
  - Decision maker: 556
  - Second contact: 374
  - Personal LinkedIn: 252
  - Company LinkedIn page: 407
  - Phone: 386
  - Public email: 386
  - Phone or email: 467
- **Unhappy-signal companies** (complained publicly or switched tools): 61 among active companies.
  25 of the top 50 have one.
- **Cost estimates:** 420 of the 625 have a competitor-cost and Tavilo-cost estimate.
- **POSSIBLE re-check (2026-10-07):** all 1,109 POSSIBLE companies (1,123 rows) were re-checked under
  `VALIDATE_SPEC.md` (streams `reval-possible-01` … `-25`). See the research report for results.

## What changed from the earlier lists

- **TheirStack:**
  - A TheirStack country page that doesn't exist quietly shows the global top 10. So most country-tagged
    rows in the old `theirstack-raw.jsonl` were the same 10 companies repeated with wrong countries.
  - Public pages never show detection dates, job counts or confidence, so those columns are blank.
- **"Timesheets" and "Time Analytics" are false matches.** About 99% of their 373 rows are generic
  words in job ads ("submit timesheets", "real-time analytics"), so they are DO_NOT_TARGET.
  - Also mostly noise: "My Hours" (~90%) and "Time Cop" (a Ruby testing library).
  - Small agencies tagged Hubstaff often turned out to use HubSpot.
- **The earlier outreach list was often over-confident:**
  - Undated or pre-2023 case studies whose champion has left were downgraded.
  - "Experience with X or similar" job ads were downgraded.
  - Switchers were moved to FORMER for the tool they left.
  - Resellers, distributors and vendor-affiliated firms became DO_NOT_TARGET (for example a Teramind
    distributor, the DeskTime sister company, and an Insightful reseller).
- **Vendor "published" dates** for Time Doctor (2023-12-19), ActivTrak (2025-02-13), DeskTime and
  Time Champ are site-migration or template stamps. Real dates were taken from page metadata or the first
  Wayback capture, which moved many stories back to 2016–2022 and lowered their confidence.
- **Contacts were re-checked** against current team pages. Dozens who had left were replaced, and the
  contact list for a company comes from the newest check.

## Which discovery channels worked

Based on `8-channel-summary.csv` ("records on useful prospects" = CURRENT/PROBABLE with priority ≥ 60).

1. **Vendor case studies** (sitemaps plus Wayback for removed stories) gave the most volume:
   659 records, 292 CURRENT and 173 PROBABLE. Quality depends on the story's age.
2. **Job postings** gave the most reliable current-use signal: 171 records, 121 CURRENT.
   OnlineJobs.ph (searched on the site itself), Workable and the Himalayas APIs were the productive sources.
   The ATS `site:` searches (Greenhouse, Lever, Ashby) produced almost nothing.
3. **Glassdoor / employee reviews** were few (30) but mostly about prospects we'd want to call, with
   complaints built in (screenshots every 10 minutes, "productive hours" quotas, idle-time docking).
4. **Switch statements in competitor case studies** ("we moved from Hubstaff to WebWork") produced
   most FORMER rows and the most price-sensitive prospects.
5. **Harvest's 2026 repricing** produced the most named public complaints: CEOs posting bills going from
   $90 to $600, $130 to $2,110, and up 978%.
6. **GitHub and company docs** were small but very strong:
   - MDM scripts silently installing Time Doctor on every Mac
   - a handbook requiring Hubstaff
   - a bot flagging low Hubstaff activity
7. **TheirStack** gave volume only. 975 technographic records produced almost no confirmed prospects
   on their own, so it is useful only as a list to validate.
8. **Reddit and X** gave nothing usable. Reddit blocks fetching, X/LinkedIn post search returned nothing,
   and anonymous posters were never identified. Named public complainers came from Trustpilot business
   reviews, company blogs and news coverage instead.

## Common complaints by vendor (for pitch angles)

Full themes with dated example URLs are in `../raw/complaint-themes-*.json`.

- **Hubstaff:** annual lock-in and refund refusals, add-ons and seats billed without request,
  AI-chatbot-only support, timers that keep running.
- **Time Doctor:** billing after cancellation, unrequested plan changes, crashes, payroll still manual.
- **ActivTrak:** auto-renewal traps (Trustpilot ~1.5), "productive hours" quotas used against staff.
- **Insightful:** billed for users it created automatically, gaps in onboarding.
- **Teramind / Veriato:** installs that fail, unresponsive support, backlash against covert surveillance.
- **DeskTime:** price rises at renewal (one report of +67%).
- **Harvest:** usage-based repricing (5–17× renewals at 30 days' notice).
- **Clockify:** 2026 free-plan cut (5-user cap; exports and billable rates moved to paid plans).
- **QuickBooks Time:** +25% from July 2026.
- **Toggl:** support hard to reach.
- **Jibble:** crashes and GPS issues.

## Limits and what is left

- **The 2,000-call web-search budget ran out** during the contact enrichment. Contacts after that point
  came from company websites and public registries only, so many decision makers have no personal LinkedIn.
  To fill them, raise `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` and run an enrichment pass with
  `make_gap_batches.py`.
- **Not searched:** Indeed, LinkedIn Jobs, Rozee, Naukri and JobStreet (blocked), and pre-2025
  OnlineJobs postings (saved in `raw/discover-jobs.work/`).
- **Snippet-only evidence.** Glassdoor and Indeed block page fetches, so their evidence comes from
  search snippets; each such record says so in `notes`.
- **Estimates.** Seat counts are estimates (headcount when nothing is stated), and so is spend. List
  prices with their source URLs are in the Competitors sheet. Four vendors don't publish prices
  (ProHance, Sapience, Ekran, InterGuard), so their prices are marked ESTIMATE.
- **Check before outreach:**
  - Companies flagged in `notes` with parked or unreachable domains, unidentified owners or name-only
    domain matches.
  - Build A Rocket Boy (active Teramind litigation) and 7shifts (sells a time clock) are manual
    DO_NOT_TARGET.
  - Impac Mortgage's bankruptcy note is unverified.
- **Privacy.** No email was guessed or built from a name pattern, no LinkedIn URL was constructed, and no
  anonymous reviewer was identified. Contact names come from company pages, vendor stories,
  registries or search results, and data-broker emails were not copied.

## Rebuilding

From `docs/research/v3/`:

```bash
python3 build_v3.py         # needs openpyxl for the xlsx; the CSVs work without it
python3 verify_v3.py        # checks + headline numbers
python3 make_gap_batches.py 3 45   # next enrichment round: companies still missing contact fields
```

Agent specs are in `AGENT_SPEC.md`, `ENRICH_SPEC.md` and `VALIDATE_SPEC.md`. Raw stream outputs are in `raw/`.
