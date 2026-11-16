#!/usr/bin/env python3
"""Export every company in the v3 master dataset to one markdown file (TAVILO_COMPANIES_V3.md)."""
import csv, re, sys
from collections import defaultdict
from pathlib import Path

V3 = Path(__file__).resolve().parent
dest = Path(sys.argv[1]) if len(sys.argv) > 1 else V3 / "out" / "TAVILO_COMPANIES_V3.md"
master = list(csv.DictReader((V3 / "out" / "1-master-dataset.csv").open()))
ORDER = {"CURRENT": 0, "PROBABLE": 1, "POSSIBLE": 2, "FORMER": 3, "DO_NOT_TARGET": 4}

by_co = defaultdict(list)
for r in master:
    by_co[r["company_domain"] or re.sub(r"[^a-z0-9]", "", r["company_name"].lower())].append(r)


def status(rows):
    return min(ORDER[r["current_status"]] for r in rows)


def cell(v, n=None):
    v = (v or "").replace("|", "/").replace("\n", " ").strip()
    return v[:n] + "…" if n and len(v) > n else v


cos = sorted(by_co.values(), key=lambda rs: (status(rs), -max(int(r["Tavilo_priority_score"] or 0) for r in rs)))
out = ["# Tavilo v3 — all companies", "",
       "Generated from `1-master-dataset.csv`. Sorted by status, then Tavilo priority score.",
       "Full detail for CURRENT / PROBABLE / FORMER; one line each for POSSIBLE and DO_NOT_TARGET.",
       "Contacts were copied from public pages (see source URLs). Nothing was guessed. Seats and costs are estimates.", ""]
labels = {0: "CURRENT", 1: "PROBABLE", 2: "POSSIBLE", 3: "FORMER", 4: "DO_NOT_TARGET"}
groups = defaultdict(list)
for rs in cos:
    groups[status(rs)].append(rs)
out.append("| Status | Companies |\n|---|---:|")
for s in range(5):
    out.append(f"| {labels[s]} | {len(groups[s])} |")

for s in (0, 1, 3):
    out += ["", f"## {labels[s]} ({len(groups[s])})", ""]
    for i, rs in enumerate(groups[s], 1):
        rs = sorted(rs, key=lambda r: (ORDER[r["current_status"]], -int(r["Tavilo_priority_score"] or 0)))
        r = rs[0]
        out.append(f"### {i}. {r['company_name']}")
        facts = [f"**Domain:** {r['company_domain'] or '—'}", f"**Country:** {r['HQ_country'] or '—'}",
                 f"**Employees:** {cell(r['employee_count'], 60) or '—'}", f"**Industry:** {cell(r['industry'], 60) or '—'}",
                 f"**Priority:** {r['Tavilo_priority_score']}"]
        out.append(" · ".join(facts))
        out.append("")
        for t in rs:
            out.append(f"- **{t['competitor_vendor']}**: {t['current_status']}, confidence {t['confidence_score']}, "
                       f"{t['evidence_type']} ({t['source_publication_date'] or 'undated'}). "
                       f"{cell(t['evidence_summary'], 400)} Source: {t['source_url']}"
                       + (f"; also {t['second_source_url']}" if t["second_source_url"] else ""))
        if r["unhappy_signal"]:
            out.append(f"- **Unhappy signal:** {r['unhappy_signal']} ({r['complaint_category']}). "
                       f"{cell(r['complaint_summary'], 300)} {r['complaint_url']}")
        if r["left_tool"] or r["now_tool"]:
            out.append(f"- **Switch:** left {r['left_tool'] or '—'} → now {r['now_tool'] or '—'}")
        if r["decision_maker"]:
            out.append(f"- **Decision maker:** {r['decision_maker']} — {cell(r['decision_maker_title'], 80)} "
                       f"{r['decision_maker_linkedin']} (source: {r['decision_maker_source'] or r['contact_source_url'] or '—'})")
        if r["second_contact"]:
            out.append(f"- **2nd contact:** {r['second_contact']} — {cell(r['second_contact_title'], 80)} {r['second_contact_linkedin']}")
        if r["other_contacts"]:
            out.append(f"- **Other contacts:** {cell(r['other_contacts'], 400)}")
        contact = [x for x in (r["company_phone"] and f"phone {r['company_phone']}",
                               r["public_email"] and f"email {r['public_email']}",
                               r["company_linkedin"] and f"LinkedIn {r['company_linkedin']}") if x]
        if contact:
            out.append(f"- **Company contact:** {'; '.join(contact)} (source: {r['contact_source_url'] or '—'})")
        if r["estimated_competitor_monthly_cost"]:
            out.append(f"- **Economics (estimate):** seats {r['estimated_tracked_seats']}; competitor "
                       f"{r['estimated_competitor_monthly_cost']}/mo; Tavilo {r['estimated_Tavilo_monthly_cost']}/mo; "
                       f"annual saving {r['estimated_annual_savings']}")
        if r["pitch_angle"]:
            out.append(f"- **Pitch angle:** {cell(r['pitch_angle'], 300)}")
        if r["notes"]:
            out.append(f"- **Notes:** {cell(r['notes'], 500)}")
        out.append("")

for s in (2, 4):
    out += ["", f"## {labels[s]} ({len(groups[s])})", "",
            "| Company | Domain | Country | Employees | Tool(s) | Conf | Source | Reason / notes |",
            "|---|---|---|---|---|---:|---|---|"]
    for rs in groups[s]:
        r = rs[0]
        out.append(f"| {cell(r['company_name'], 50)} | {r['company_domain']} | {cell(r['HQ_country'], 20)} | "
                   f"{cell(r['employee_count'], 20)} | {', '.join(sorted({t['competitor_vendor'] for t in rs}))} | "
                   f"{r['confidence_score']} | {r['source_url']} | {cell(r['notes'], 160)} |")

dest.write_text("\n".join(out) + "\n")
print(dest, f"{dest.stat().st_size / 1e6:.1f} MB", len(cos), "companies")
