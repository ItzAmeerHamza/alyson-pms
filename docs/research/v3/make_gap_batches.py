#!/usr/bin/env python3
"""Export CURRENT/PROBABLE companies with missing outreach fields into enrichment batches.

Run after build_v3.py. Usage: python3 make_gap_batches.py <round> [batch_size]
Skips companies already listed in an earlier round's batches.
"""
import csv, json, re, sys
from pathlib import Path

V3 = Path(__file__).resolve().parent
rnd = sys.argv[1] if len(sys.argv) > 1 else "1"
size = int(sys.argv[2]) if len(sys.argv) > 2 else 45

done = set()
for p in (V3 / "batches").glob("enrich-gaps-*.json"):
    done |= {r["company_name"] for r in json.loads(p.read_text())}

FIELDS = ["company_name", "company_domain", "HQ_country", "employee_count", "industry", "competitor_vendor",
          "current_status", "source_url", "decision_maker", "decision_maker_title", "decision_maker_linkedin",
          "second_contact", "second_contact_title", "second_contact_linkedin", "company_linkedin",
          "company_phone", "public_email", "contact_source_url"]
NEEDS = ["decision_maker", "decision_maker_linkedin", "second_contact", "company_linkedin", "company_phone", "public_email"]

rows = list(csv.DictReader((V3 / "out" / "2-top-50-prospects.csv").open()))  # header reference only
master = list(csv.DictReader((V3 / "out" / "1-master-dataset.csv").open()))
seen, gaps = set(), []
for r in sorted(master, key=lambda r: -int(r["Tavilo_priority_score"] or 0)):
    if r["current_status"] not in ("CURRENT", "PROBABLE"):
        continue
    key = r["company_domain"] or re.sub(r"[^a-z0-9]", "", r["company_name"].lower())
    if key in seen or r["company_name"] in done:
        continue
    seen.add(key)
    m = re.search(r"\d[\d,]*", r["employee_count"] or "")
    if m and int(m.group(0).replace(",", "")) > 5000:
        continue
    missing = [f for f in NEEDS if not r[f]]
    if not missing:
        continue
    g = {f: r[f] for f in FIELDS}
    g["missing"] = missing
    gaps.append(g)

n = 0
for i in range(0, len(gaps), size):
    n += 1
    (V3 / "batches" / f"enrich-gaps-{rnd}{chr(96 + n)}.json").write_text(json.dumps(gaps[i:i + size], indent=1))
print(len(gaps), "companies in", n, "batches")
