#!/usr/bin/env python3
"""Merge the 2026-10-05 agent research into one ranked outreach workbook.

Inputs: tavilo-small-companies-top-100.csv plus agent JSON in outreach-sources/.
Output: tavilo-outreach-list.xlsx and tavilo-outreach-list.csv.
"""
import csv, json, re
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "outreach-sources"
TOP100 = ROOT / "tavilo-small-companies-top-100.csv"

# Rows the research showed are not real prospects (rank -> reason).
REMOVE = {
    "44": "Sells employee-monitoring software itself (competitor).",
    "34": "Job board of ACCA, a large global accounting body, not an SMB.",
    "71": "Website dead (unknown domain).",
    "74": "Website is a 'coming soon' placeholder.",
    "77": "Real website not found; CSV domain was bamboohr.com.",
    "88": "Website returns 404.",
}
FLAG = {
    "87": "HRMLabs sells attendance/GPS tracking itself; partly a competitor.",
    "48": "Resells security tools; may be a partner rather than an end customer.",
    "4": "onlinespecialists.com.au is gone; pitch David Judge at Affordable Staff.",
}

# Manual priority corrections after reading the agent notes.
OVERRIDE = {
    "On The Map Marketing": ("B", "Current CEO unknown; Rick Hoskins left in 2023 and Kristaps Brencans in Aug 2025."),
    "Alpha Co. Marketing & Media": ("C", "1-10 staff, below the 10-employee floor."),
    "Ecotrips Costa Rica": ("C", "Mild 3-star review; probably under 10 staff."),
    "Premier Admin Services": ("C", "About 5 staff, below the 10-employee floor."),
    "Locca Boba Tea": ("C", "Probably under 10 staff."),
}
# Fields the earlier batches left blank.
FIELDS = {
    "Grammar Electrical": {"left_tool": "Hubstaff", "complaint": "price"},
    "Zagirova Design (Zagirova)": {"complaint": "billing"},
    "Locca Boba Tea": {"complaint": "bugs-accuracy"},
    "Stratcore Developments": {"complaint": "support"},
    "Simple Biz": {"complaint": "price"},
    "Metaviz": {"complaint": "missing features"},
    "MID Construction": {"complaint": "missing features"},
    "TRG": {"complaint": "missing features"},
    "NtoN": {"complaint": "missing features"},
}

COLS = [
    ("priority", "Priority", 9), ("company", "Company", 26), ("website", "Website", 24),
    ("country", "HQ country", 13), ("employees", "Employees", 14), ("industry", "Industry", 22),
    ("tool", "Current tool", 14), ("unhappy", "Unhappy signal", 14),
    ("complaint", "Complaint", 16), ("left_tool", "Tool they left", 14), ("evidence_status", "Evidence status", 15),
    ("evidence_type", "Evidence type", 20), ("evidence_date", "Evidence date", 12),
    ("evidence_url", "Evidence URL", 34), ("evidence_quote", "Evidence quote", 40),
    ("contact_name", "Decision maker", 20), ("contact_title", "Title", 18),
    ("contact_linkedin", "Decision maker LinkedIn", 34),
    ("contact2_name", "2nd contact", 18), ("contact2_title", "2nd title", 16),
    ("contact2_linkedin", "2nd contact LinkedIn", 30),
    ("company_linkedin", "Company LinkedIn", 30), ("phone", "Company phone", 22),
    ("email", "Public email", 26), ("contact_source", "Contact source", 30),
    ("notes", "Notes / pitch angle", 60), ("batch", "Found by", 16),
]

# Switch stories from the 2026-09-30 research (tavilo-former-customers.csv): company -> tool used now.
FORMER_NOW = {"MID Construction": "WebWork Time Tracker", "Metaviz": "WebWork Time Tracker",
              "NtoN": "DeskTime", "Simple Biz": "Hubstaff", "TRG": "Insightful"}

PRIORITY_RULES = """A = publicly complained about their current tool since 2024, or direct 2024+ evidence of use AND a named decision maker.
B = confirmed or 2024+ evidence of use, but contact details are thin.
C = older or undated evidence (case study, review); confirm they still use the tool.
D = technographic signal only (TheirStack); usage not verified."""


def li(url):
    """Keep only personal LinkedIn profile URLs."""
    url = (url or "").strip()
    return url if "linkedin.com/in/" in url else ""


def load(name):
    p = SRC / name
    return json.loads(p.read_text()) if p.exists() else []


def completeness(r):
    return sum(bool(r[k]) for k in ("contact_name", "contact_linkedin", "phone", "email"))


def new_row(x, batch):
    notes = x.get("notes", "")
    status = (x.get("status") or "").upper()
    unhappy = (x.get("unhappy_type") or "").lower()
    if not unhappy and "SWITCH SIGNAL" in notes.upper():
        unhappy = "complaint"
    elif not unhappy and ("switched" in notes.lower() or "left hubstaff" in notes.lower()):
        unhappy = "switched away"
    r = {
        "company": x.get("company_name", ""), "website": x.get("website", ""),
        "country": x.get("hq_country", ""), "employees": str(x.get("employees", "")),
        "industry": x.get("industry", ""), "tool": x.get("vendor", ""),
        "unhappy": unhappy, "complaint": x.get("complaint_category", ""),
        "left_tool": x.get("left_tool", ""),
        "evidence_status": status, "evidence_type": x.get("evidence_type", ""),
        "evidence_date": str(x.get("evidence_date", "")), "evidence_url": x.get("evidence_url", ""),
        "evidence_quote": x.get("evidence_quote", ""),
        "contact_name": x.get("contact_name", ""), "contact_title": x.get("contact_title", ""),
        "contact_linkedin": li(x.get("contact_linkedin")),
        "contact2_name": "", "contact2_title": "", "contact2_linkedin": "",
        "company_linkedin": x.get("company_linkedin", ""), "phone": x.get("company_phone", ""),
        "email": x.get("public_email", ""),
        "contact_source": x.get("contact_source_url") or x.get("contact_info_source_url", ""),
        "notes": notes, "batch": batch,
    }
    if unhappy == "complaint":
        r["priority"] = "A" if status == "CURRENT" else "B"
    elif unhappy == "switched away" and not x.get("left_tool"):
        r["priority"] = "A"  # earlier batches: switched once on price, e.g. Grammar Electrical
    elif unhappy == "switched away":
        r["priority"] = "B" if r["contact_name"] else "C"
    elif status == "CURRENT" and r["contact_name"]:
        r["priority"] = "A"
    elif status == "CURRENT":
        r["priority"] = "B"
    else:
        r["priority"] = "C"
    return r


def top100_rows():
    enrich = {str(e["rank"]): e for e in load("enrich-1-50.json") + load("enrich-51-100.json")}
    rows, removed = [], []
    for c in csv.DictReader(TOP100.open()):
        rk = c["rank"]
        e = enrich.get(rk, {})
        notes = " ".join(filter(None, [FLAG.get(rk, ""), e.get("notes", ""), c.get("notes", "")]))
        r = {
            "company": c["company_name"],
            "website": e.get("website") or c["company_domain"],
            "country": c["HQ_country"], "employees": e.get("employees") or c["employees"],
            "industry": c["industry"], "tool": c["competitor_vendor"],
            "unhappy": "", "complaint": "", "left_tool": "",
            "evidence_status": c["current_status"].replace(" CUSTOMER", ""),
            "evidence_type": c["list_tier"], "evidence_date": "", "evidence_url": c["evidence_url"],
            "evidence_quote": "",
            "contact_name": e.get("contact_name") or c["named_contact"],
            "contact_title": e.get("contact_title") or c["contact_role"],
            "contact_linkedin": li(e.get("contact_linkedin")) or li(c["contact_linkedin_or_search"]),
            "contact2_name": e.get("second_contact_name", ""),
            "contact2_title": e.get("second_contact_title", ""),
            "contact2_linkedin": li(e.get("second_contact_linkedin")),
            "company_linkedin": e.get("company_linkedin") or c["linkedin_company_page"],
            "phone": e.get("company_phone") or c["company_phone"],
            "email": e.get("public_email") or c["public_email"],
            "contact_source": e.get("contact_source_url") or e.get("contact_info_source_url") or c["where_to_start"],
            "notes": notes.strip(), "batch": f"Existing list #{rk}",
        }
        if rk in REMOVE or (e.get("status_check", "").upper().startswith("DEFUNCT") and rk != "4"):
            r["priority"] = "REMOVED"
            r["notes"] = (REMOVE.get(rk) or "Website dead or unreachable.") + " " + r["notes"]
            removed.append(r)
            continue
        if c["list_tier"].startswith("Confirmed"):
            r["priority"] = "A" if r["contact_name"] else "B"
        else:
            r["priority"] = "D"
        rows.append(r)
    return rows, removed


def main():
    rows, removed = top100_rows()
    seen = {}
    for r in rows + removed:
        for k in keys(r):
            seen[k] = r
    for f, batch in [("new-timedoctor.json", "New: Time Doctor & similar"),
                     ("new-hubstaff.json", "New: Hubstaff & similar"),
                     ("new-signals.json", "New: jobs & switch signals"),
                     ("unhappy-reviews-primary-1.json", "Unhappy: reviews"),
                     ("unhappy-reviews-primary-2.json", "Unhappy: reviews"),
                     ("unhappy-reviews-adjacent.json", "Unhappy: reviews"),
                     ("unhappy-switchers-primary.json", "Unhappy: switch stories"),
                     ("unhappy-switchers-adjacent.json", "Unhappy: switch stories"),
                     ("former", "Unhappy: earlier research")]:
        for x in (former_rows() if f == "former" else load(f)):
            nr = new_row(x, batch)
            hit = next((seen[k] for k in keys(nr) if k in seen), None)
            if not keys(nr):
                continue
            if hit:
                # Several agents found the same company: fill blanks, keep the better priority.
                old = hit
                for k, v in nr.items():
                    if k == "left_tool" and v and old.get(k) and v not in old[k]:
                        old[k] += "; " + v
                    elif v and not old.get(k):
                        old[k] = v
                if old["priority"] in "BCD" and nr["priority"] < old["priority"]:
                    old["priority"] = nr["priority"]
                continue
            for k in keys(nr):
                seen[k] = nr
            rows.append(nr)

    for r in rows:
        r.update(FIELDS.get(r["company"], {}))
        if r["company"] in OVERRIDE:
            r["priority"], why = OVERRIDE[r["company"]]
            r["notes"] = why + " " + r["notes"]
        if r["company"] == "Online Specialists":
            r["company"] = "Affordable Staff (formerly Online Specialists)"
            r["website"] = "affordablestaff.com.au"

    order = {"A": 0, "B": 1, "C": 2, "D": 3}
    rows.sort(key=lambda r: (order[r["priority"]], -completeness(r), r["company"].lower()))

    wb = Workbook()
    ws = wb.active
    ws.title = "Outreach list"
    write_sheet(ws, rows)
    unhappy = [r for r in rows if r["unhappy"]]
    unhappy.sort(key=lambda r: (r["unhappy"] != "complaint", order[r["priority"]], -completeness(r)))
    write_sheet(wb.create_sheet("Unhappy with tool"), unhappy)
    write_sheet(wb.create_sheet("Removed"), removed)

    g = wb.create_sheet("How to read")
    lines = [
        "Tavilo outreach list, built 2026-10-05 from public sources.",
        "",
        "Priority",
        *PRIORITY_RULES.splitlines(),
        "",
        "Rules the research followed",
        "Every LinkedIn, phone and email was copied from a public page; the Contact source column names it.",
        "No email address was guessed from a name pattern and no LinkedIn URL was constructed. Blank means not found.",
        "Unhappy companies are counted only when the company itself is named publicly (a review under the business name, or a named case study). Individual reviewers were not traced to employers.",
        "'Switched away' means a vendor's case study says they left a tool; they may be happy with the new one, but they have shown they will switch.",
        "Case-study evidence is often undated; confirm current tool use on the first call.",
        "The web-search budget ran out mid-research, so ranks 34-100 of the existing list were checked from company websites only.",
        "",
        "Counts",
        f"Prospects: {len(rows)}",
        *[f"Priority {p}: {sum(r['priority'] == p for r in rows)}" for p in "ABCD"],
        f"With a named decision maker: {sum(bool(r['contact_name']) for r in rows)}",
        f"With a personal LinkedIn URL: {sum(bool(r['contact_linkedin']) for r in rows)}",
        f"With a phone: {sum(bool(r['phone']) for r in rows)}",
        f"With an email: {sum(bool(r['email']) for r in rows)}",
        f"Unhappy with their tool: {len(unhappy)} ({sum(r['unhappy'] == 'complaint' for r in unhappy)} complained, {sum(r['unhappy'] == 'switched away' for r in unhappy)} switched away)",
        f"Removed: {len(removed)}",
    ]
    for i, t in enumerate(lines, 1):
        g.cell(i, 1, t).font = Font(name="Arial", bold=t in ("Priority", "Rules the research followed", "Counts"))
    g.column_dimensions["A"].width = 110
    wb.move_sheet("How to read", offset=-3)
    wb.active = 1
    wb.save(ROOT / "tavilo-outreach-list.xlsx")

    with (ROOT / "tavilo-outreach-list.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow([c[1] for c in COLS])
        for r in rows:
            w.writerow([r[c[0]] for c in COLS])

    print(lines[-9:])


def former_rows():
    out = []
    for c in csv.DictReader((ROOT / "tavilo-former-customers.csv").open()):
        if c["company_name"] not in FORMER_NOW:
            continue  # TalentPop is 2,000+ staff
        out.append({
            "company_name": c["company_name"], "website": c["company_domain"],
            "hq_country": c["HQ_country"], "employees": c["employee_count"], "industry": c["industry"],
            "vendor": FORMER_NOW[c["company_name"]], "left_tool": c["competitor_vendor"],
            "status": "PROBABLE", "unhappy_type": "switched away",
            "evidence_type": c["evidence_type"], "evidence_url": c["source_url"],
            "evidence_quote": c["evidence_summary"], "evidence_date": c["source_publication_date"],
            "notes": "From the 2026-09-30 research; contacts not yet researched.",
        })
    return out


def domain(url):
    m = re.search(r"([a-z0-9-]+\.[a-z.]{2,})", (url or "").lower().replace("www.", ""))
    return m.group(1) if m and " " not in (url or "").strip() else ""


def keys(r):
    return [k for k in (norm(r["company"]), domain(r["website"])) if k]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("inc", "").replace("llc", ""))


def write_sheet(ws, rows):
    head = Font(name="Arial", bold=True, color="FFFFFF")
    fills = {"A": "C6EFCE", "B": "DDEBF7", "C": "FFF2CC", "D": "F2F2F2", "REMOVED": "F8CBAD"}
    for j, (_, label, width) in enumerate(COLS, 1):
        cell = ws.cell(1, j, label)
        cell.font = head
        cell.fill = PatternFill("solid", fgColor="1F3864")
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(j)].width = width
    body = Font(name="Arial", size=10)
    for i, r in enumerate(rows, 2):
        for j, (k, _, _) in enumerate(COLS, 1):
            v = r[k]
            cell = ws.cell(i, j, v)
            cell.font = body
            cell.alignment = Alignment(vertical="top", wrap_text=k in ("notes", "evidence_quote"))
            if isinstance(v, str) and v.startswith("http"):
                cell.hyperlink = v
                cell.font = Font(name="Arial", size=10, color="0563C1", underline="single")
        ws.cell(i, 1).fill = PatternFill("solid", fgColor=fills[r["priority"]])
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COLS))}{max(len(rows) + 1, 1)}"


if __name__ == "__main__":
    main()
