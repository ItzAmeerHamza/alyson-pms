# enrich-gaps-1d progress

Status: COMPLETE. All 45 input companies have a record in enrich-gaps-1d.json.

Rebuild: `python3 raw/enrich-gaps-1d.work/build.py`. It merges updates.py (indexes 0-29) and updates2.py (30-44) over the input.
scrape.py is a curl helper that pulls emails, Cloudflare emails, tel links and LinkedIn links from a company's own pages.

Method:
- Indexes 0-9 used WebSearch plus WebFetch.
- At index 9 the session's WebSearch budget ran out (2000/2000).
- Indexes 10-44 used only company websites (home, about, team, contact, privacy pages) and public registries (NorthData, OpenCorporates).
- No other search engines were used.

Gains vs input:
- 3 companies gained a decision maker where none existed: Amazon Whisperer, NETCONOMY, Standard Chartered.
- 5 companies gained a new verified personal LinkedIn.
- 5 gained a phone.
- 14 gained a public email.

Still blank or blocked, and needing manual browser or search work:
- Sites blocked or unreadable: Wynncrest (site is a JS shell), Vitality Medical (Cloudflare), NETCONOMY site (Cloudflare), Z1 (Vercel checkpoint), Nabo Group (Wix).
- Dolce Calma: no decision maker found.
- Readiness IT/CONKORD: no phone, email or second contact.
- Most personal LinkedIns that were missing need a people search.
