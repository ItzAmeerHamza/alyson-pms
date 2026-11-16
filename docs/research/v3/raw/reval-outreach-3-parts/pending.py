"""Build partial records for input rows 51-69 (web tools hit session limit on 2026-10-05).

TheirStack listings for most of these rows WERE re-checked this run (see TS_CONFIRMED).
Usage-evidence search, negative-signal search and contact re-verification are still PENDING.
"""
import json

SRC = '/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3/batches/outreach-3.json'
OUT = '/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3/raw/reval-outreach-3-parts/batch.json'

# row -> (TheirStack page actually re-fetched this run, employee count shown there)
TS_CONFIRMED = {
    51: ("https://theirstack.com/en/technology/timedoctor/us", "14"),
    52: ("https://theirstack.com/en/technology/desktime/uy", "119"),
    53: ("https://theirstack.com/en/technology/screenshot-monitor/no", "14"),
    54: ("https://theirstack.com/en/technology/timedoctor/pk", "17"),
    55: ("https://theirstack.com/en/technology/hubstaff/au", "22"),
    56: ("https://theirstack.com/en/technology/teramind/fr", "40"),
    57: ("https://theirstack.com/en/technology/teramind/us", "167"),
    58: ("https://theirstack.com/en/technology/timedoctor/uy", "12"),
    59: ("https://theirstack.com/en/technology/teramind/us", "50"),
    60: ("https://theirstack.com/en/technology/desktime/uy", "33"),
    64: ("https://theirstack.com/en/technology/hubstaff/gb", "55"),
    65: ("https://theirstack.com/en/technology/screenshot-monitor/no", "13"),
    66: ("https://theirstack.com/en/technology/hubstaff/cl", "48"),
    67: ("https://theirstack.com/en/technology/hubstaff/pk", "53"),
    68: ("https://theirstack.com/en/technology/timedoctor/ca", "85"),
    69: ("https://theirstack.com/en/technology/timedoctor/es", "30"),
}

SPECIAL = {
    51: dict(confidence_score=25,
             workforce_signals="On-site HVAC installers/technicians (field workforce, $28-34/hr install assistants per a bebee job listing); desktop tracking fit is weak unless office/dispatch VAs.",
             second_source_url="https://bebee.com/us/jobs/hvac-install-assistant-air-sharks-san-jose-ca--theirstack-683122695",
             extra="Partial check done: Air Sharks job ads found (HVAC Install Assistant, on-site San Jose) - none mention Time Doctor; the bebee page now 404s."),
    53: dict(confidence_score=20, extra="Earlier run: minimal one-page site for a dating platform (DATELAND); very low fit."),
    56: dict(status="POSSIBLE", confidence_score=20,
             extra="REDOPUS is a cybersecurity consultancy (per the earlier list); like RIDCHA DATA (row 41) it may be an integrator/reseller of monitoring/DLP tools. Probable DO_NOT_TARGET once checked."),
    59: dict(confidence_score=35, workforce_signals="Offshore staffing / virtual assistant company (per earlier list); strong monitoring fit.",
             extra="Strong fit if confirmed (offshore staffing). Prioritise when re-validating."),
    63: dict(status="DO_NOT_TARGET", confidence_score=10,
             status_reason="Per the earlier list, HRMLabs is a Singapore HRMS/payroll SaaS with its own attendance/GPS tracking module, so it is a partial competitor of Tavilo. Its own site was not re-checked this run.",
             extra="TheirStack hubstaff/sg page not re-fetched (session limit)."),
    68: dict(confidence_score=35, workforce_signals="Telehealth with remote doctors/support staff (per earlier list); 85 employees on TheirStack.",
             extra="Plausible fit (remote telehealth support)."),
}

d = json.load(open(SRC))
recs = []
for i in range(51, 70):
    r = d[i]
    sp = SPECIAL.get(i, {})
    ts = TS_CONFIRMED.get(i)
    ts_note = (f"TheirStack listing RE-CONFIRMED this run on {ts[0]} ({ts[1]} employees)." if ts
               else f"TheirStack page {r['Evidence URL']} NOT re-fetched (session limit).")
    contacts = []
    if r["Decision maker"]:
        contacts.append({"name": r["Decision maker"], "title": r["Title"] + " (from earlier list; not re-verified)",
                         "linkedin": r["Decision maker LinkedIn"], "source_url": r["Contact source"]})
    if r["2nd contact"]:
        contacts.append({"name": r["2nd contact"], "title": r["2nd title"] + " (from earlier list; not re-verified)",
                         "linkedin": r["2nd contact LinkedIn"], "source_url": r["Contact source"]})
    status = sp.get("status", "POSSIBLE")
    rec = {
        "input_row": i,
        "company_name": r["Company"],
        "company_domain": r["Website"].replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0],
        "industry": r["Industry"],
        "hq_country": r["HQ country"],
        "employee_count": (f"{ts[1]} (TheirStack)" if ts else r["Employees"]),
        "employee_count_source_url": (ts[0] if ts else r["Evidence URL"]),
        "estimated_tracked_seats": "",
        "vendor": r["Current tool"],
        "evidence_type": "Technographic signal — requires validation",
        "evidence_summary": f"TheirStack lists {r['Company']} as a {r['Current tool']} user. No independent evidence gathered yet: the usage-evidence and negative-signal searches are PENDING because the web tools hit their session limit.",
        "evidence_quote": "",
        "source_url": (ts[0] if ts else r["Evidence URL"]),
        "source_publication_date": "",
        "second_source_url": sp.get("second_source_url", ""),
        "third_source_url": "",
        "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
        "status": status,
        "status_reason": sp.get("status_reason", "TheirStack-only so far; full re-validation pending (web session limit)."),
        "confidence_score": sp.get("confidence_score", 30 if ts else 25),
        "unhappy_type": "", "complaint_category": "", "complaint_summary": "", "complaint_url": "", "complaint_date": "",
        "left_tool": "", "now_tool": "",
        "workforce_signals": sp.get("workforce_signals", ""),
        "contacts": contacts,
        "company_linkedin": r["Company LinkedIn"],
        "company_phone": (r["Company phone"] + " (earlier list; not re-verified)") if r["Company phone"] else "",
        "public_email": (r["Public email"] + " (earlier list; not re-verified)") if r["Public email"] else "",
        "contact_source_url": r["Contact source"],
        "pitch_angle": "",
        "notes": (f"Original priority: {r['Priority']}; Found by: {r['Found by']}; input row {i}. "
                  f"PENDING full re-validation: web search/fetch hit the session limit on 2026-10-05. {ts_note} "
                  + (sp.get("extra", "") + " " if sp.get("extra") else "")
                  + "Contacts, phone and email are carried over from the earlier list and NOT re-verified. "
                  + "Earlier-list note: " + r["Notes / pitch angle"].split(" Web search budget")[0].split(" Employee count is")[0]),
    }
    recs.append(rec)
json.dump(recs, open(OUT, "w"), indent=1, ensure_ascii=False)
print("wrote", len(recs))
