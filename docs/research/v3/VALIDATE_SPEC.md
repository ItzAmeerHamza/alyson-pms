# Re-checking POSSIBLE companies (wave 3)

Read `AGENT_SPEC.md` first. Its record schema, evidence rules, confidence rubric, outreach rules and
privacy rules apply in full. Never guess an email or build one from a name pattern, and never construct
a LinkedIn URL. Blank beats wrong.

Input: `v3/batches/possible-NN.json`, a list of companies. Each company is a list of one or more rows
(one per competitor tool) that are POSSIBLE today, mostly from TheirStack alone. Expect most to be false
matches: earlier checks found that only ~1 in 7 TheirStack-only rows held up.

## For every company + tool row, decide a new status

1. **Is the company real and alive?** Visit the domain. Dead, parked, acquired and shut down → every
   row `DO_NOT_TARGET` with `status_reason`.
2. **Is it a vendor, reseller, partner, review site or a competitor of Tavilo?** → `DO_NOT_TARGET`.
3. **Is the tool match about the software?** Known traps: "Timesheets", "Time Analytics" ("real-time
   analytics"), "Time Tracker", "My Hours", "Harvest", "Timely", ProHance (an MRI drug), "full-time
   doctor", HubSpot read as Hubstaff, Homebase (also a generic word and other products). False match →
   `DO_NOT_TARGET` for that tool, `status_reason` saying what the text really meant.
4. **Look for real evidence of use.** Try at least 2 searches per company + tool, e.g.
   `"<company>" "<tool>"`, `"<company>" <tool> time tracking`, `site:<domain> <tool>`, plus the
   company's careers page, job boards (Himalayas, Workable, OnlineJobs.ph, Glassdoor snippets),
   the vendor's customer pages, handbooks and GitHub.
   - Explicit current evidence → `CURRENT` or `PROBABLE` with source URL, date and confidence per the
     rubric.
   - Explicit "we stopped / switched from" → `FORMER`, with `now_tool`.
   - Nothing beyond TheirStack → keep `POSSIBLE`, `confidence_score` 30 or lower, and say in `notes`
     what you searched.
   - If you find the company uses a *different* competitor tool, add a record for that tool too.
5. Record complaints (`unhappy_type`) when a company's own staff or leaders complain publicly. Never
   identify anonymous reviewers.

## Outreach info

- **CURRENT / PROBABLE / FORMER:** get everything (AGENT_SPEC "Outreach info"): decision maker and
  second contact with source URLs, personal LinkedIn only if seen verbatim, company LinkedIn, phone,
  public email, employee count, country, pitch angle.
- **Still POSSIBLE, 25–2,500 employees, and a remote / BPO / agency / offshore team:** decision maker,
  company LinkedIn, phone and email from the company's own site. Skip personal LinkedIn searches.
- **Other POSSIBLE and all DO_NOT_TARGET:** no contact research.
- Existing contacts in the input: keep them only if you confirm they are still in the role.

## Output

`v3/raw/reval-possible-NN.json` (NN = your batch number), one record per company + tool, in the
AGENT_SPEC schema. Copy `company_name`, `company_domain` and `vendor` (= input `competitor_vendor`)
**exactly** from the input so the merge matches them. Every input row must get a record. Rewrite the
file after every 3–5 companies and keep `reval-possible-NN.progress.md` beside it. If the file exists
when you start, read it and continue where it stopped. Keep scratch files in
`v3/raw/reval-possible-NN.work/` and never name them `*.json`.

Working rules:
- Do not spawn sub-agents.
- Write files with the Write tool, or with a saved script run as `python3 path/to/script.py`.

Final message: records written, count by new status, how many gained a decision maker / LinkedIn /
phone / email, and the 5 best prospects found.
