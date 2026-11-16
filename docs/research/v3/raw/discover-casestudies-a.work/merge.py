"""Merge work/rec/*.json into ../discover-casestudies-a.json with full schema + known-company flag."""
import json, os, glob, re
os.chdir(os.path.dirname(os.path.abspath(__file__)))
FIELDS = ["company_name", "company_domain", "industry", "hq_country", "employee_count", "employee_count_source_url",
          "estimated_tracked_seats", "vendor", "evidence_type", "evidence_summary", "evidence_quote", "source_url",
          "source_publication_date", "second_source_url", "third_source_url", "first_detected_date",
          "last_detected_date", "theirstack_jobs_count", "status", "status_reason", "confidence_score",
          "unhappy_type", "complaint_category", "complaint_summary", "complaint_url", "complaint_date", "left_tool",
          "now_tool", "workforce_signals", "contacts", "company_linkedin", "company_phone", "public_email",
          "contact_source_url", "pitch_angle", "notes"]

def norm(s):
    s = s.lower()
    s = re.sub(r'\b(inc|llc|ltd|limited|pvt|private|corp|corporation|co|gmbh|group|the|solutions|technologies|services)\b', ' ', s)
    return re.sub(r'[^a-z0-9]', '', s)

TDH = 'https://www.timedoctor.com/'
TDS = 'https://www.timedoctor.com/solutions/staff-leasing'
INB = 'https://www.insightful.io/bpo'
INE = 'https://www.insightful.io/enterprise'
PATCH = {
    ('Dentistry Support', 'Time Doctor'): (TDH, 'CEO testimonial + logo on Time Doctor home page (2026-10).', 'CURRENT', 98),
    ('Phoenix Virtual Solutions', 'Time Doctor'): (TDH, 'Rommel Ragasa quote on TD home page and David Quintero (Dir. Business Development) on TD staff-leasing page (2026-10).', 'PROBABLE', 75),
    ('SmartBuyGlasses', 'Time Doctor'): (TDH, 'Rafael Vazquez (SmartBuyGlasses) quote + logo on TD home page (2026-10).', 'CURRENT', 98),
    ('Eufonie', 'Time Doctor'): (TDS, 'Johan le Bail quote on TD staff-leasing page (2026-10).', 'PROBABLE', 60),
    ('Boring Commerce', 'Time Doctor'): (TDS, 'Monica Thakwani quote on TD staff-leasing page (2026-10).', 'PROBABLE', 55),
    ('upUgo', 'Time Doctor'): ('https://www.timedoctor.com/solutions/agencies', 'Luke Sartain quote on TD agencies & SMB solution pages (2026-10).', 'PROBABLE', 65),
    ('Farmers Insurance', 'Insightful'): (INE, 'Farmers Insurance logo on Insightful BPO/enterprise pages (2026-10).', 'POSSIBLE', 45),
    ('Alia Services', 'Insightful'): (INB, 'Alia Services stat-logo on Insightful BPO page (2026-10).', 'PROBABLE', 75),
    ('Digital Estimating', 'Insightful'): (INB, 'Digital Estimating stat-logo on Insightful BPO page (2026-10).', 'PROBABLE', 55),
    ('Mercor', 'Insightful'): (INE, 'Mercor logo on Insightful enterprise page (2026-10).', 'CURRENT', 100),
    ('H&CO', 'Insightful'): (INE, 'H&CO quote-logo on Insightful enterprise page (2026-10).', 'CURRENT', 100),
    ('Support Zebra', 'Insightful'): ('https://www.insightful.io/', 'Logo on Insightful home page (2026-10).', 'PROBABLE', 65),
    ('Agilisium', 'Time Champ'): ('https://www.timechamp.io/', 'Logo on Time Champ home page (2026-10).', 'CURRENT', 100),
}
DOMAINS = {}
if os.path.exists('domain_check.json'):
    DOMAINS = json.load(open('domain_check.json'))
known = {norm(l.strip()): l.strip() for l in open('../../known-companies.txt') if l.strip()}
recs = []
for f in sorted(glob.glob('rec/*.json')):
    for r in json.load(open(f)):
        full = {k: r.get(k, [] if k == 'contacts' else (0 if k == 'confidence_score' else '')) for k in FIELDS}
        n = norm(full['company_name'])
        hit = known.get(n)
        if hit and 'known-companies' not in full['notes']:
            full['notes'] = (full['notes'] + ' ' if full['notes'] else '') + f'[Already in known-companies.txt as "{hit}" - contacts not enriched by this stream]'
        p = PATCH.get((full['company_name'], full['vendor']))
        if p and full['status'] not in ('FORMER', 'DO_NOT_TARGET'):
            url, note, st, conf = p
            if not full['second_source_url']:
                full['second_source_url'] = url
            elif not full['third_source_url']:
                full['third_source_url'] = url
            full['notes'] = (full['notes'] + ' ' if full['notes'] else '') + note
            if conf > full['confidence_score']:
                full['confidence_score'] = conf
                full['status'] = st
                full['status_reason'] += '; upgraded: ' + note
        dv = DOMAINS.get(full['company_domain'])
        if dv is not None and dv is False:
            full['notes'] += f" [Domain {full['company_domain']} not verified by fetch 2026-10-05]"
        recs.append(full)
json.dump(recs, open('../discover-casestudies-a.json', 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print(len(recs), Counter(r['status'] for r in recs), Counter(r['vendor'] for r in recs))
