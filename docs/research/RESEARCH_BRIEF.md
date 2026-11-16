# Tavilo competitor-customer research brief

Saved 2026-10-05 from the user's instructions. Run this in a fresh session with
`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION=2000` (already set in ~/.claude/settings.json).

## User instructions on top of the brief

- **Be skeptical of the previous list.** The ~1,000 companies in `theirstack-raw.jsonl` /
  `tavilo-competitor-customers.csv` may be wrong. Re-evaluate every one with the phases below.
- **Negative reviews of competitor products are very important.** Search Reddit and Twitter/X too.
- **Get ALL information needed for outreach** for every prospect worth contacting:
  - decision maker name + title (CEO / founder / COO / CTO / Head of Ops), with source URL
  - a second contact if available
  - decision maker's exact LinkedIn profile URL (`linkedin.com/in/...`), only when it appeared
    on a page or search result and clearly matches person + company
  - company LinkedIn page
  - company phone(s) and public email(s), with source URL
  - website, HQ country, employee count
  - the pitch angle (complaint, price sensitivity, remote team, BPO, etc.)
- Never guess emails or build them from name patterns; never construct LinkedIn URLs. Blank beats wrong.
- Only include a company when its identity is public. Don't de-anonymize individual reviewers.
- Agents must save progress to disk every few companies (usage limits have cut runs short).

## Tavilo pricing (from `backend/src/billing/billing.catalog.ts`)

| Plan | Monthly | Included seats | Extra seat |
|---|---|---|---|
| Starter | $49 | 10 | $4 |
| Business | $199 | 50 | $3 |
| Growth | $399 | 100 | $2.50 |

Pick the cheapest plan for the estimated seat count.

## Earlier work to reuse (and re-check)

- `outreach-sources/*.json` — 2026-10-05 agent outputs (new companies, contacts, unhappy companies)
- `tavilo-outreach-list.xlsx/.csv` — merged 210-row list from those, built by `build_outreach_list.py`
- `outreach-sources/work/exclude.txt` — names already covered
- `outreach-sources/work/.venv` — Python with openpyxl (system pip is locked)
- Note: Harvest's 2026 price increase (after Bending Spoons acquisition) produced many public complaints.

---

## The brief (verbatim from the user)

# Objective

Build a comprehensive, evidence-backed database of companies currently using software that competes with Tavilo, especially employee time tracking, workforce productivity monitoring, employee monitoring, remote-team tracking, screenshots/activity tracking, workforce analytics and attendance/productivity software.

The purpose is to identify high-quality B2B sales prospects for Tavilo.

Do not simply create a list of competitors. Find the COMPANIES USING those competitors.

# Primary competitors

Start with:

Time Doctor, Hubstaff, Insightful, DeskTime, Time Champ, WebWork Time Tracker, We360.ai, ActivTrak, Teramind, Controlio, Monitask, ProHance, Prodoscore, KeepActive / Kickidler, Veriato Vision, Work Examiner, TimeCamp, Apploye, Traqq

Then expand into adjacent time-tracking products where appropriate:

Clockify, Toggl Track, Jibble, Harvest, Everhour, TrackingTime, Replicon, Timesheets.com, Time Analytics, QuickBooks Time, RescueTime, Timeero, Timely, Timeular, My Hours

Also discover additional competitors from G2, Capterra, TheirStack, GetApp, Software Advice and similar current software directories.

Maintain a master competitor table so that newly discovered relevant vendors are added automatically.

# Phase 1 — TheirStack

Use TheirStack's Employee Monitoring technology category.

If an authenticated TheirStack session is available, use it. Otherwise use publicly indexed TheirStack pages.

Find every relevant technology in the Employee Monitoring category.

For every relevant technology:

1. Determine the approximate number of companies TheirStack has detected.
2. Retrieve as many company names as possible.
3. Capture: company name, company domain, competitor technology, employee count, country, industry, revenue if available, TheirStack confidence if available, number of jobs mentioning the technology, first date detected, last date detected, underlying job/evidence URL if available.

Prioritize technology signals seen in the last 18 months.

Do not assume a TheirStack detection proves current use. Mark it as "Technographic signal — requires validation" unless another source confirms usage.

# Phase 2 — Glassdoor

Search indexed Glassdoor reviews for every competitor.

Use searches similar to:

site:glassdoor.com/Reviews "Time Doctor"
site:glassdoor.com/Reviews "Time Doctor" screenshots
site:glassdoor.com/Reviews "Time Doctor" tracking
site:glassdoor.com/Reviews "Time Doctor" employee

Repeat for every competitor.

Also use linguistic combinations such as: "[vendor]" "we use", "[vendor]" "they use", "[vendor]" "required", "[vendor]" "screenshots", "[vendor]" "time tracker", "[vendor]" "track employees", "[vendor]" "monitoring", "[vendor]" "productive time", "[vendor]" "active hours".

Extract the EMPLOYER being reviewed, not Glassdoor itself or the software vendor.

Capture the publication date and a concise paraphrase of exactly what the employee says about use of the software.

Do not identify or research anonymous individual reviewers.

# Phase 3 — Competitor customer pages

For every competitor search:

site:competitordomain.com customers
site:competitordomain.com case studies
site:competitordomain.com success stories
site:competitordomain.com testimonials

Crawl all publicly available customer stories.

For every named company capture: company, vendor, company size, number of seats/users if stated, industry, country, use case, customer-since date if available, case-study publication/update date, source URL.

Treat a current live vendor customer story as strong evidence, but distinguish old/historical case studies from recently updated evidence.

# Phase 4 — Job postings

Search current and recently cached job postings.

Queries should combine vendor names with phrases such as: "Time Doctor" job, "Time Doctor" required, "Time Doctor" hours, "Time Doctor" remote, "Hubstaff" employee, "Hubstaff" screenshots, "Hubstaff" required.

Search major ATS and career systems including: Greenhouse, Lever, Ashby, Workable, SmartRecruiters, BambooHR, Indeed, LinkedIn indexed job pages, company career sites.

A current job saying employees use or must use the product is an extremely strong signal.

A job merely asking for "experience with Hubstaff or similar tools" is weaker and should not be treated as confirmation.

# Phase 5 — Public company documentation

Search: "[vendor]" handbook, "[vendor]" onboarding, "[vendor]" employee, "[vendor]" remote work, "[vendor]" filetype:pdf, "[vendor]" productivity, "[vendor]" attendance, "[vendor]" payroll.

Also search company domains after a candidate company is discovered:

site:companydomain.com "Hubstaff"
site:companydomain.com "Time Doctor"

Look for: employee handbooks, remote-work policies, onboarding guides, IT setup documentation, training documents, help-center pages, public Google Docs/PDFs, contractor instructions.

# Phase 6 — GitHub and public technical evidence

Search public GitHub repositories, scripts and IT documentation for competitor software.

Look for: installer package names, MDM/deployment scripts, API keys or API documentation references — never expose credentials, desktop-agent deployment instructions, SSO setup, user provisioning, integration configuration.

Only use publicly accessible, legitimate information.

Do not attempt to access private repositories, bypass authentication, expose credentials or exploit systems.

# Phase 7 — Forums and public employee discussions

Search Reddit, public forums, public social posts and indexed discussion sites for phrases like: "my company uses Time Doctor", "our company uses Hubstaff", "employer requires Hubstaff", "forced to use Time Doctor", "we switched from Time Doctor", "Hubstaff alternative", "replace Hubstaff".

Capture a company only when the company identity is explicitly public.

Do not attempt to deanonymize anonymous users.

# Confidence scoring

Score each COMPANY + VENDOR relationship from 0–100.

- 100 = current/recent vendor case study explicitly naming the company
- 98 = 2026 employee review explicitly saying company currently uses software
- 95 = current job or handbook explicitly requires software
- 90 = multiple independent recent sources agree
- 80 = strong recent TheirStack signal
- 70 = one recent technographic/job reference
- 50 = one older explicit employee review
- 30 = weak or ambiguous mention

Add confidence for multiple independent sources. Subtract confidence for old/stale evidence.

If a source specifically says the company STOPPED using the product, record STATUS = Former customer. Do not put that company in the active-prospect customer list without another newer source showing resumed/current use.

# Tavilo prospect scoring

Separately create a TAVILO PRIORITY SCORE.

Favor companies that: have 25–2,500 employees; have 25+ estimated monitored/time-tracking seats; operate remote/hybrid workforces; are BPOs; are agencies; have customer-service teams; have offshore teams; have distributed software teams; use contractors; use screenshot/activity-monitoring features; appear sensitive to software cost; have complaints about monitoring software; have employees complaining about current competitor usability; use the competitor for payroll/billing/productivity reporting.

Do not confuse prospect quality with evidence confidence. Maintain both fields.

# Required master-table columns

company_name, company_domain, industry, HQ_country, employee_count, estimated_tracked_seats, competitor_vendor, competitor_category, evidence_type, evidence_summary, source_url, source_publication_date, first_detected_date, last_detected_date, confidence_score, current_status, second_source_url, third_source_url, cross_validated, estimated_competitor_monthly_cost, estimated_Tavilo_monthly_cost, estimated_annual_savings, Tavilo_priority_score, suggested_buyer_titles, notes

(Plus the outreach columns listed at the top of this file.)

# Important classification rules

- CURRENT CUSTOMER: Strong recent evidence of current usage.
- PROBABLE CUSTOMER: Strong evidence but not fully confirmed.
- POSSIBLE CUSTOMER: Technographic or ambiguous evidence requiring validation.
- FORMER CUSTOMER: Evidence explicitly says they stopped using the software.
- DO NOT TARGET: Software vendor itself, irrelevant company, false match, or insufficient evidence.

# Tavilo economics

Where enough information exists, estimate current competitor spend. Use actual publicly available competitor pricing where possible and cite the pricing source. Then calculate an estimated Tavilo alternative based on Tavilo pricing (table above). Clearly label seat counts and spend estimates as estimates.

# Final deliverables

Continue research until you have at least 250 unique companies OR exhaustive searching produces sharply diminishing new results.

Produce:

1. Master competitor/customer dataset.
2. Top 50 highest-priority Tavilo prospects.
3. Separate high-confidence current-customer list.
4. Separate "needs validation" queue.
5. Former-customer/churn list.
6. Competitor summary showing: vendor, accounts discovered, high-confidence accounts, estimated seats, primary industries, common complaints.
7. Source audit showing where each lead came from.
8. Summary of which discovery channels produced the most useful leads.

Deduplicate companies across every source.

Never state that a company is a current customer unless the evidence supports that conclusion.

Always preserve URLs and dates so a human can independently verify every important finding.

Continue beyond obvious search results. Search each competitor separately and use multiple query formulations. Do not stop merely because an initial search returns enough examples.
