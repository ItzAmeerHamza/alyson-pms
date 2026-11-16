#!/usr/bin/env python3
"""Export every POSSIBLE company into re-check batches (see VALIDATE_SPEC.md).

Run after build_v3.py. Usage: python3 make_possible_batches.py [batch_size]
Writes v3/batches/possible-NN.json. Companies of Tavilo's target size come first.
"""
import csv, json, re, sys
from collections import defaultdict
from pathlib import Path

V3 = Path(__file__).resolve().parent
size = int(sys.argv[1]) if len(sys.argv) > 1 else 45
ORDER = {"CURRENT": 0, "PROBABLE": 1, "FORMER": 2, "POSSIBLE": 3, "DO_NOT_TARGET": 4}
KEEP = ["company_name", "company_domain", "industry", "HQ_country", "employee_count", "competitor_vendor",
        "evidence_type", "evidence_summary", "source_url", "confidence_score", "current_status",
        "workforce_signals", "decision_maker", "decision_maker_title", "decision_maker_linkedin",
        "company_linkedin", "company_phone", "public_email", "notes"]


def key(r):
    return r["company_domain"] or re.sub(r"[^a-z0-9]", "", r["company_name"].lower())


def employees(r):
    m = re.search(r"\d[\d,]*", r["employee_count"] or "")
    return int(m.group(0).replace(",", "")) if m else None


rows = defaultdict(list)
for r in csv.DictReader((V3 / "out" / "1-master-dataset.csv").open()):
    rows[key(r)].append(r)

companies = []
for rs in rows.values():
    if min(ORDER[r["current_status"]] for r in rs) != ORDER["POSSIBLE"]:
        continue
    e = employees(rs[0])
    rank = 0 if e and 25 <= e <= 2500 else 1 if e is None else 2 if e < 25 else 3
    companies.append((rank, -max(int(r["Tavilo_priority_score"] or 0) for r in rs),
                      [{k: r[k] for k in KEEP} for r in rs if r["current_status"] == "POSSIBLE"]))
companies.sort(key=lambda c: c[:2])

for old in (V3 / "batches").glob("possible-*.json"):
    old.unlink()
n = 0
for i in range(0, len(companies), size):
    n += 1
    batch = [c[2] for c in companies[i:i + size]]
    (V3 / "batches" / f"possible-{n:02d}.json").write_text(json.dumps(batch, indent=1))
print(len(companies), "companies in", n, "batches")
