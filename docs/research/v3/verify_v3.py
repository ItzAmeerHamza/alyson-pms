#!/usr/bin/env python3
"""Sanity checks and headline numbers for the v3 deliverables (run after build_v3.py)."""
import csv, re
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out"
ORDER = {"CURRENT": 0, "PROBABLE": 1, "POSSIBLE": 2, "FORMER": 3, "DO_NOT_TARGET": 4}


def rows(name):
    return list(csv.DictReader((OUT / name).open()))


def filled(k, rs):
    return sum(bool(r[k]) for r in rs)


master = rows("1-master-dataset.csv")
best = {}
for r in master:
    k = r["company_domain"] or re.sub(r"[^a-z0-9]", "", r["company_name"].lower())
    if k not in best or ORDER[r["current_status"]] < ORDER[best[k]["current_status"]]:
        best[k] = r
cp = [r for r in best.values() if r["current_status"] in ("CURRENT", "PROBABLE")]
print(f"CURRENT+PROBABLE companies: {len(cp)}")
for k in ("decision_maker", "decision_maker_linkedin", "second_contact", "company_linkedin",
          "company_phone", "public_email", "unhappy_signal", "estimated_annual_savings"):
    print(f"  {k}: {filled(k, cp)}")
print("  phone or email:", sum(bool(r["company_phone"] or r["public_email"]) for r in cp))
print("  vendors:", Counter(r["competitor_vendor"] for r in cp).most_common(15))

top = rows("2-top-50-prospects.csv")
print("Top 50:", Counter(r["current_status"] for r in top),
      {k: filled(k, top) for k in ("decision_maker", "decision_maker_linkedin", "company_phone",
                                    "public_email", "unhappy_signal")})

ts_only = [r for r in master if r["current_status"] == "CURRENT" and "theirstack" in r["source_url"]
           and not r["second_source_url"]]
print("CHECK current on TheirStack only (want 0):", len(ts_only))
bad_li = sum(1 for r in master for k in ("decision_maker_linkedin", "second_contact_linkedin")
             if r[k] and "linkedin.com/in/" not in r[k])
print("CHECK non-profile LinkedIn URLs (want 0):", bad_li)
print("CHECK FORMER in top 50 (want 0):", sum(r["current_status"] == "FORMER" for r in top))

print("\nChannels:")
for r in rows("8-channel-summary.csv"):
    print(" ", r["dimension"], "|", r["channel"], "| records", r["records"], "| CURRENT", r["CURRENT"],
          "| PROBABLE", r["PROBABLE"], "| DNT", r["DO_NOT_TARGET"], "| on useful prospects", r["records_on_useful_prospects"])

print("\nCompetitors:")
for r in rows("6-competitor-summary.csv")[:20]:
    print(" ", r["vendor"], r["accounts_discovered"], "cur", r["current"], "hi", r["high_confidence_accounts"],
          "complaints", r["companies_with_complaints"], "|", r["common_complaints"][:100])
