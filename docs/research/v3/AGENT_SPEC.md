# Tavilo v3 research — shared agent spec

Folder: `/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/`
(call it ROOT). Full user brief: `ROOT/RESEARCH_BRIEF.md` — read it first.

Tavilo sells employee time tracking + activity/screenshot monitoring (competes with Time Doctor,
Hubstaff, Insightful, etc.). We are finding COMPANIES THAT USE competitor tools, to sell to them.

## Tools
WebSearch and WebFetch are deferred tools: load them first with
`ToolSearch(query="select:WebSearch,WebFetch", max_results=2)`. Use many query formulations.
If a page will not fetch, use the search snippet and say so in `notes`.

## Output — save early, save often
Write a JSON array to `ROOT/v3/raw/<your-stream-name>.json` (the name is given in your task).
**Rewrite the whole file after every 3–5 companies** (usage limits have killed earlier runs).
Also keep `ROOT/v3/raw/<your-stream-name>.progress.md` with: queries done, vendors/rows covered,
what is left. If the file already exists when you start, READ IT and continue from where it stopped.

One record per COMPANY + VENDOR relationship:

```json
{
  "company_name": "", "company_domain": "example.com", "industry": "", "hq_country": "",
  "employee_count": "", "employee_count_source_url": "",
  "estimated_tracked_seats": "",            // number or "" — label as estimate in notes
  "vendor": "Hubstaff",                     // canonical vendor name
  "evidence_type": "",                      // one of the list below
  "evidence_summary": "",                   // your paraphrase of exactly what the source says
  "evidence_quote": "",                     // short verbatim quote (<= 30 words), optional
  "source_url": "", "source_publication_date": "",   // YYYY-MM-DD or YYYY-MM or YYYY; "" if unknown
  "second_source_url": "", "third_source_url": "",
  "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
  "status": "CURRENT|PROBABLE|POSSIBLE|FORMER|DO_NOT_TARGET",
  "status_reason": "",                      // why that status (esp. DO_NOT_TARGET / downgrades)
  "confidence_score": 0,                    // 0-100, rubric below
  "unhappy_type": "",                       // "complaint" | "switched away" | ""
  "complaint_category": "",                 // price | billing | bugs-accuracy | privacy/morale | support | missing features | usability | performance
  "complaint_summary": "", "complaint_url": "", "complaint_date": "",
  "left_tool": "", "now_tool": "",
  "workforce_signals": "",                  // remote, BPO, agency, offshore, contractors, call center, screenshots used, payroll/billing use...
  "contacts": [                             // decision makers: CEO/founder/COO/CTO/Head of Ops/HR/IT
    {"name": "", "title": "", "linkedin": "", "source_url": ""}
  ],
  "company_linkedin": "", "company_phone": "", "public_email": "", "contact_source_url": "",
  "pitch_angle": "",
  "notes": ""
}
```

`evidence_type` values: `Vendor case study`, `Vendor testimonial/logo`, `Employee review`,
`Current job posting`, `Older job posting`, `Company documentation`, `GitHub/technical`,
`Forum/social post (company identified)`, `Public review by company (G2/Capterra/Trustpilot/app store)`,
`Technographic signal — requires validation`, `Vendor case study (churn statement)`,
`Company's own website/blog`.

## Evidence rules
- Be skeptical. A TheirStack hit, a vendor logo wall, or "experience with Hubstaff or similar" in a
  job ad is NOT proof of current use.
- Check the vendor is not the company itself, a reseller/partner, a review site, a competitor
  of Tavilo, or an affiliate/"best tools" blog → `DO_NOT_TARGET` with a reason.
- Name collisions: "Harvest", "Timely", "Toggl", "Timesheets", "Time Analytics", "Jibble", "Clockify"
  are often generic words or unrelated meanings. Confirm the text is about the SOFTWARE.
- Explicit "we stopped / switched from / replaced X" → `FORMER` for X (and record `now_tool`).
- Company dead / domain parked / acquired & shut → `DO_NOT_TARGET`.
- Keep URLs and dates for every claim so a human can verify.

## Confidence rubric (0–100)
100 current/recent (2025–2026) vendor case study naming the company · 98 2026 employee review saying
the company currently uses it · 95 current job or handbook explicitly requiring it · 90 multiple
independent recent sources · 80 strong recent TheirStack signal · 70 one recent technographic/job
reference · 50 one older explicit employee review · 30 weak/ambiguous. Add for independent
corroboration; subtract for stale evidence (pre-2023 = −15 or more).

## Outreach info — GET EVERYTHING AVAILABLE, NEVER INVENT
For every company that is not DO_NOT_TARGET, try to fill:
- decision maker name + title (CEO / founder / COO / CTO / Head of Ops / HR / IT) with source URL,
  and a second contact if one exists
- personal LinkedIn `linkedin.com/in/...` — ONLY if that exact URL appeared on a page or in a search
  result and clearly matches the person + company. Never construct or guess one.
- company LinkedIn page (`linkedin.com/company/...`), website, HQ country, employee count
- company phone(s) and public email(s) from the company's own site (contact page, footer, privacy
  policy, imprint) or another public listing — with `contact_source_url`
- NEVER guess an email or build it from a name pattern. Blank beats wrong.
Good places: company About/Team/Contact pages, footer, LinkedIn search results
(`"Company" CEO site:linkedin.com/in`), Crunchbase/ZoomInfo/RocketReach snippets (names/titles
only — do not copy guessed emails from them), Clutch/GoodFirms profiles, press releases, podcasts.

## Privacy
Only include a company when its identity is public. Never identify or research anonymous
reviewers or Reddit users. Don't record individual employees other than business decision makers.

## Final message
Return a short summary: records written, count by status, number with a decision maker / LinkedIn /
phone / email, the 5 best prospects, and anything left undone.
