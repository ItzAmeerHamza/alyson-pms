import json, os
OUT = "/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3/raw/discover-complaints-primary.json"
FIELDS = ["company_name", "company_domain", "industry", "hq_country", "employee_count", "employee_count_source_url",
          "estimated_tracked_seats", "vendor", "evidence_type", "evidence_summary", "evidence_quote", "source_url",
          "source_publication_date", "second_source_url", "third_source_url", "first_detected_date", "last_detected_date",
          "theirstack_jobs_count", "status", "status_reason", "confidence_score", "unhappy_type", "complaint_category",
          "complaint_summary", "complaint_url", "complaint_date", "left_tool", "now_tool", "workforce_signals", "contacts",
          "company_linkedin", "company_phone", "public_email", "contact_source_url", "pitch_angle", "notes"]
TODAY = "2026-10-05"
R = []
def add(**kw):
    r = {f: "" for f in FIELDS}
    r["contacts"] = []
    r["confidence_score"] = 0
    r["first_detected_date"] = TODAY
    r["last_detected_date"] = TODAY
    for k, v in kw.items():
        if k not in FIELDS:
            raise KeyError(k)
        r[k] = v
    if r["unhappy_type"] and not r["complaint_url"]:
        r["complaint_url"] = r["source_url"]
    if r["unhappy_type"] and not r["complaint_date"]:
        r["complaint_date"] = r["source_publication_date"]
    R.append(r)

def C(name, title, linkedin="", src=""):
    return {"name": name, "title": title, "linkedin": linkedin, "source_url": src}

exec(open(os.path.join(os.path.dirname(__file__), "records.py")).read())

json.dump(R, open(OUT, "w"), indent=1, ensure_ascii=False)
from collections import Counter
print(len(R), Counter(r["status"] for r in R), Counter(r["vendor"] for r in R))
