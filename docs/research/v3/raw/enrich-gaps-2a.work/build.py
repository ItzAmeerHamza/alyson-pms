"""Builds raw/enrich-gaps-1a.json from the batch input plus findings in findings_*.py."""
import json, os, glob, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.dirname(os.path.dirname(HERE))
INP = os.path.join(V3, "batches", "enrich-gaps-2a.json")
OUT = os.path.join(V3, "raw", "enrich-gaps-2a.json")

F = {}
for p in sorted(glob.glob(os.path.join(HERE, "findings_*.py"))):
    spec = importlib.util.spec_from_file_location(os.path.basename(p)[:-3], p)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    F.update(m.F)

batch = json.load(open(INP))
out = []
for i, c in enumerate(batch):
    if i not in F:
        continue
    f = F[i]
    def keep(k_out, k_in):
        return f.get(k_out, c.get(k_in, ""))
    if "contacts" in f:
        contacts = f["contacts"]
    else:
        contacts = []
        if c.get("decision_maker"):
            contacts.append({"name": c["decision_maker"], "title": c["decision_maker_title"],
                             "linkedin": c["decision_maker_linkedin"], "source_url": c.get("contact_source_url", "")})
        if c.get("second_contact"):
            contacts.append({"name": c["second_contact"], "title": c["second_contact_title"],
                             "linkedin": c["second_contact_linkedin"], "source_url": c.get("contact_source_url", "")})
    rec = {
        "company_name": c["company_name"],
        "company_domain": keep("company_domain", "company_domain"),
        "vendor": c["competitor_vendor"],
        "evidence_type": "Contact enrichment",
        "status": f.get("status", ""),
        "confidence_score": f.get("confidence_score", 0),
        "employee_count": keep("employee_count", "employee_count"),
        "hq_country": keep("hq_country", "HQ_country"),
        "contacts": contacts,
        "company_linkedin": keep("company_linkedin", "company_linkedin"),
        "company_phone": keep("company_phone", "company_phone"),
        "public_email": keep("public_email", "public_email"),
        "contact_source_url": keep("contact_source_url", "contact_source_url"),
        "notes": f.get("notes", ""),
    }
    if f.get("status_reason"):
        rec["status_reason"] = f["status_reason"]
    out.append(rec)

json.dump(out, open(OUT, "w"), indent=2, ensure_ascii=False)
print("wrote", len(out), "records to", OUT)

st = {"records": len(out),
      "with_decision_maker": sum(1 for r in out if r["contacts"]),
      "with_personal_linkedin": sum(1 for r in out if any(x.get("linkedin") for x in r["contacts"])),
      "with_phone": sum(1 for r in out if r["company_phone"]),
      "with_email": sum(1 for r in out if r["public_email"]),
      "do_not_target": sum(1 for r in out if r["status"] == "DO_NOT_TARGET")}
done = [r["company_name"] for r in out]
left = [c["company_name"] for i, c in enumerate(batch) if i not in F]
open(OUT.replace(".json", ".progress.md"), "w").write(
    "# enrich-gaps-2a progress\n\nStats: %s\n\nDone (%d):\n%s\n\nLeft (%d):\n%s\n" % (
        st, len(done), "\n".join("- " + x for x in done), len(left), "\n".join("- " + x for x in left)))
print(st)
