# Contact-enrichment agents (wave 2)

Read `AGENT_SPEC.md` first: its outreach and privacy rules apply in full. Never guess an email or
build one from a name pattern, and never construct a LinkedIn URL. Blank beats wrong.

Input: `v3/batches/enrich-gaps-<id>.json`. Each company already has a confirmed tool relationship and
lists the fields still blank under `missing`. Existing values are there for context. Check that an
existing decision maker is still in the role (people leave), and replace them if not.

For each company, look for the missing fields:
- **Decision maker and second contact:** CEO, founder, COO, Head of Ops, HR director or IT head.
  Name, title and the source URL where they appear.
- **Personal LinkedIn:** a `linkedin.com/in/...` URL that appeared verbatim on a page or in a search
  result and clearly matches that person and company.
- **Company LinkedIn page, phone(s) and public email(s):** from the company's own site (contact page,
  footer, privacy policy, imprint) or a public business listing, with `contact_source_url`.

Where to look: the company site's About/Team/Contact pages, `"<company>" CEO site:linkedin.com/in`,
Crunchbase, Clutch, GoodFirms, press releases, podcasts and government business registries
(Companies House, OpenCorporates). From data brokers (ZoomInfo, RocketReach, Apollo), copy names and
titles only, never emails.

Output: `v3/raw/enrich-gaps-<id>.json`, one record per input company. Rewrite it every 3–5 companies,
and keep `.progress.md` beside it. Record format:

```json
{"company_name": "", "company_domain": "", "vendor": "<input competitor_vendor>",
 "evidence_type": "Contact enrichment", "status": "", "confidence_score": 0,
 "employee_count": "", "hq_country": "",
 "contacts": [{"name": "", "title": "", "linkedin": "", "source_url": ""}],
 "company_linkedin": "", "company_phone": "", "public_email": "", "contact_source_url": "",
 "notes": "what you found / changed; 'still in role' checks; anything not found"}
```

- **Contacts:** include existing contacts you confirmed, decision maker first.
- **Status:** leave `status` empty. The only exception: the company is dead, acquired and shut, or
  turns out to be a vendor or reseller. Then set `"status": "DO_NOT_TARGET"` with a `status_reason`.

Working rules:
- Do not spawn sub-agents.
- Write files with the Write tool, or with a saved script run as `python3 path/to/script.py`.

Final message: records written, and how many gained a decision maker, LinkedIn, phone and email.
