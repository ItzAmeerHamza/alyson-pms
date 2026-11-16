#!/usr/bin/env python3
"""Builds ROOT/v3/raw/discover-complaints-adjacent.json from records_*.py parts."""
import json, os, glob, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "discover-complaints-adjacent.json")

FIELDS = ["company_name", "company_domain", "industry", "hq_country", "employee_count",
          "employee_count_source_url", "estimated_tracked_seats", "vendor", "evidence_type",
          "evidence_summary", "evidence_quote", "source_url", "source_publication_date",
          "second_source_url", "third_source_url", "first_detected_date", "last_detected_date",
          "theirstack_jobs_count", "status", "status_reason", "confidence_score", "unhappy_type",
          "complaint_category", "complaint_summary", "complaint_url", "complaint_date",
          "left_tool", "now_tool", "workforce_signals", "contacts", "company_linkedin",
          "company_phone", "public_email", "contact_source_url", "pitch_angle", "notes"]


def norm(r):
    out = {}
    for f in FIELDS:
        v = r.get(f, [] if f == "contacts" else ("" if f != "confidence_score" else 0))
        out[f] = v
    extra = set(r) - set(FIELDS)
    if extra:
        raise SystemExit(f"unknown fields {extra} in {r.get('company_name')}")
    for c in out["contacts"]:
        for k in ("name", "title", "linkedin", "source_url"):
            c.setdefault(k, "")
    return out


records = []
for p in sorted(glob.glob(os.path.join(HERE, "records_*.py"))):
    spec = importlib.util.spec_from_file_location(os.path.basename(p)[:-3], p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    records.extend(norm(r) for r in m.RECORDS)

seen = set()
for r in records:
    k = (r["company_name"].lower(), r["vendor"].lower())
    if k in seen:
        raise SystemExit(f"duplicate {k}")
    seen.add(k)

with open(OUT, "w") as f:
    json.dump(records, f, indent=2, ensure_ascii=False)
from collections import Counter
print(len(records), "records ->", OUT)
print(Counter(r["status"] for r in records))
print(Counter(r["vendor"] for r in records))
