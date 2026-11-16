#!/usr/bin/env python3
"""Split the earlier lists into batches for the v3 re-validation agents."""
import csv, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
V3 = ROOT / "v3"
(V3 / "batches").mkdir(exist_ok=True)
(V3 / "raw").mkdir(exist_ok=True)


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def dump(name, rows):
    (V3 / "batches" / name).write_text(json.dumps(rows, indent=1))


outreach = list(csv.DictReader((ROOT / "tavilo-outreach-list.csv").open()))
for i in range(3):
    dump(f"outreach-{i + 1}.json", outreach[i * 70:(i + 1) * 70])

master = list(csv.DictReader((ROOT / "tavilo-competitor-customers.csv").open()))
onames = {norm(x["Company"]) for x in outreach}
CORE = {"Hubstaff", "Time Doctor", "Teramind", "ProHance", "DeskTime", "ActivTrak",
        "WebWork Time Tracker", "Work Examiner", "Screenshot Monitor", "Apploye", "Ekran System"}
KEEP = ["company_name", "company_domain", "industry", "HQ_country", "employee_count",
        "competitor_vendor", "evidence_type", "source_url", "confidence_score", "current_status", "notes"]


def slim(x):
    return {k: x[k] for k in KEEP}


fresh = [x for x in master if norm(x["company_name"]) not in onames]
tech = [x for x in fresh if x["evidence_type"].startswith("Technographic")]
core = [slim(x) for x in tech if x["competitor_vendor"] in CORE]
generic = [slim(x) for x in tech if x["competitor_vendor"] not in CORE]
strong = [slim(x) for x in fresh if not x["evidence_type"].startswith("Technographic")]
half = len(core) // 2
dump("theirstack-core-1.json", core[:half])
dump("theirstack-core-2.json", core[half:])
dump("theirstack-generic.json", generic)
dump("master-strong-not-in-outreach.json", strong)

names = sorted({x["company_name"] for x in master} | {x["Company"] for x in outreach})
(V3 / "known-companies.txt").write_text("\n".join(names) + "\n")
print(len(outreach), len(core), len(generic), len(strong), len(names))
