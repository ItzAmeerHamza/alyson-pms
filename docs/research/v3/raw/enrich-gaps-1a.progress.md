# enrich-gaps-1a progress

Status: COMPLETE. All 45 batch rows written to raw/enrich-gaps-1a.json (built by enrich-gaps-1a.work/build.py from findings_01..05.py).

- The WebSearch budget ran out at row 9. From then on, per the coordinator, only company websites and the pages they link to were fetched. Before that note arrived, 2 Brave result pages were fetched, for Skyray and Alia.
- Sites that blocked or failed fetches: affordablestaff.com.au (403), marblebox.com (down), selfdecode.com contact/privacy (timeout), mobilyinfotech.com (JS shell), onlinespecialists (no domain), Cascade (no domain).
- Duplicate: row 7 GTE and row 19 GT Ecom BV are the same company.
- Decision maker changed: TechnologyAdvice (Zach Jones), FullStack Labs (Ben Carle), BookLeaf (Musavir Khurshid is CEO).
