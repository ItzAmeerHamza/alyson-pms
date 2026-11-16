import json, glob, os
V3 = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(V3, 'raw', 'reval-possible-02.work')
inp = json.load(open(os.path.join(V3, 'batches', 'possible-02.json')))
patches = {}
for f in sorted(glob.glob(os.path.join(WORK, 'p*.txt'))):
    for p in json.load(open(f)):
        patches[(p.pop('idx'), p.pop('row_vendor', None) or p.get('vendor'))] = p
extra = []
for f in sorted(glob.glob(os.path.join(WORK, 'x*.txt'))):
    extra += json.load(open(f))

def base(r):
    contacts = []
    if r.get('decision_maker'):
        contacts.append({"name": r['decision_maker'], "title": r.get('decision_maker_title', ''),
                         "linkedin": r.get('decision_maker_linkedin', ''), "source_url": ""})
    return {
        "company_name": r['company_name'], "company_domain": r.get('company_domain', ''),
        "industry": r.get('industry', ''), "hq_country": r.get('HQ_country', ''),
        "employee_count": r.get('employee_count', ''), "employee_count_source_url": "",
        "estimated_tracked_seats": "", "vendor": r['competitor_vendor'],
        "evidence_type": r.get('evidence_type', ''), "evidence_summary": r.get('evidence_summary', ''),
        "evidence_quote": "", "source_url": r.get('source_url', ''), "source_publication_date": "",
        "second_source_url": "", "third_source_url": "", "first_detected_date": "",
        "last_detected_date": "", "theirstack_jobs_count": "",
        "status": r.get('current_status', 'POSSIBLE'), "status_reason": "",
        "confidence_score": int(r.get('confidence_score') or 0),
        "unhappy_type": "", "complaint_category": "", "complaint_summary": "", "complaint_url": "",
        "complaint_date": "", "left_tool": "", "now_tool": "",
        "workforce_signals": r.get('workforce_signals', ''), "contacts": contacts,
        "company_linkedin": r.get('company_linkedin', ''), "company_phone": r.get('company_phone', ''),
        "public_email": r.get('public_email', ''), "contact_source_url": "", "pitch_angle": "",
        "notes": r.get('notes', ''),
    }

out, missing = [], []
for i, c in enumerate(inp):
    for r in c:
        rec = base(r)
        p = patches.get((i, r['competitor_vendor']))
        if p is None:
            missing.append((i, r['company_name'], r['competitor_vendor']))
            rec['notes'] = 'NOT YET RE-CHECKED in wave 3. | ' + rec['notes']
        else:
            for k, v in p.items():
                if k == 'notes_prepend':
                    rec['notes'] = v + ' | Input notes: ' + rec['notes']
                elif k != 'vendor':
                    rec[k] = v
        out.append(rec)
for e in extra:
    rec = base({"company_name": e['company_name'], "competitor_vendor": e['vendor']})
    rec.update(e)
    out.append(rec)
json.dump(out, open(os.path.join(V3, 'raw', 'reval-possible-02.json'), 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(out), Counter(r['status'] for r in out))
print('missing', len(missing))
for m in missing: print(' ', m)
