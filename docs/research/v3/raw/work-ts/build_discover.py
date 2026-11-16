"""Build ROOT/v3/raw/discover-theirstack.json from REAL TheirStack pages only (scraped2.json / scraped.json).
Validation overlays (contacts etc.) come from validated.json keyed by "<company name>|<vendor>"."""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '..')
OUT = os.path.join(RAW, 'discover-theirstack.json')
KNOWN = os.path.join(RAW, '..', 'known-companies.txt')

GENERIC = {  # TheirStack tech names that are also ordinary words -> heavy false-positive risk
    'timesheets': 'generic word "timesheets"', 'time-analytics': 'generic phrase "time analytics"',
    'time-tracker': 'generic phrase "time tracker"', 'homebase': 'generic word "home base"',
    'sapience': 'generic word "sapience"', 'toggl': 'short brand also used for "toggle"', 'jibble': 'slang word',
    'my-hours': 'generic phrase "my hours"', 'time-cop': 'generic phrase', 'timeclick': 'generic',
    'harvest-forecast': 'Harvest is also a generic word', 'kimai': 'open-source tool', 'paymo': 'generic',
}
COMPETITOR_DOMAINS = set('''timedoctor.com hubstaff.com insightful.io desktime.com timechamp.io webwork-tracker.com we360.ai
activtrak.com teramind.co controlio.net monitask.com prohance.net prodoscore.com kickidler.com veriato.com workexaminer.com
timecamp.com apploye.com traqq.com clockify.me toggl.com jibble.io getharvest.com everhour.com trackingtime.co replicon.com
deltek.com timesheets.com timeanalyticssoftware.com rescuetime.com timeero.com timely.com early.app timeular.com myhours.com
sapienceanalytics.com workstatus.io empmonitor.com flowace.ai staffcop.com currentware.com clevercontrol.com hivedesk.com
screenshotmonitor.com ekransystem.com syteca.com interguardsoftware.com 7pace.com paymoapp.com clicktime.com beebole.com
workyard.com connecteam.com buddypunch.com joinhomebase.com clockshark.com busybusy.com simprogroup.com altametrics.com
tanda.co deputy.com clockodo.com kimai.org hourstack.com minutedock.com'''.split())
COMPETITOR_NAMES = {'teramind', 'hubstaff', 'time doctor', 'activtrak', 'desktime', 'insightful', 'simpro software',
                    'altametrics', 'connecteam', 'homebase', 'clockshark', 'busybusy'}
TARGET_IND = re.compile(r'outsourc|call cent|bpo|it services|advertising|marketing|staffing|'
                        r'design services|graphic design|public relations|customer service|business process', re.I)
NO_VALIDATE = {'homebase', 'timesheets', 'time-tracker', 'time-analytics', 'sapience'}


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def emp_num(s):
    s = (s or '').lower().replace(',', '')
    m = re.match(r'([\d.]+)\s*([km]?)', s)
    if not m:
        return None
    v = float(m.group(1)) * (1000 if m.group(2) == 'k' else 1000000 if m.group(2) == 'm' else 1)
    return int(v)


def main():
    p = os.path.join(HERE, 'scraped2.json')
    data = json.load(open(p if os.path.exists(p) else os.path.join(HERE, 'scraped.json')))
    known = {norm(l) for l in open(KNOWN) if l.strip()}
    val = json.load(open(os.path.join(HERE, 'validated.json'))) if os.path.exists(os.path.join(HERE, 'validated.json')) else {}
    out, skipped = [], 0
    for slug, rec in data.items():
        vendor = rec.get('vendor')
        total = rec.get('count', '')
        for c in rec.get('companies', {}).values():
            if norm(c['name']) in known:
                skipped += 1
                continue
            urls = list(dict.fromkeys(c['urls']))
            emp = emp_num(c['employees'])
            status, reason, conf = 'POSSIBLE', 'Public TheirStack technographic detection only; not confirmed by another source.', 55
            if slug in GENERIC:
                conf = 30
                reason += ' TheirStack tech "%s" is a likely name collision (%s); treat as weak.' % (slug, GENERIC[slug])
            if (c['domain'] in COMPETITOR_DOMAINS) or norm(c['name']) in {norm(x) for x in COMPETITOR_NAMES}:
                status, conf = 'DO_NOT_TARGET', 0
                reason = 'Company is itself a time-tracking/monitoring/workforce software vendor (competitor of Tavilo or of the detected tool).'
            r = {
                'company_name': c['name'], 'company_domain': c['domain'], 'industry': c['industry'],
                'hq_country': c['country'], 'employee_count': c['employees'], 'employee_count_source_url': urls[0],
                'revenue': c['revenue'], 'estimated_tracked_seats': '', 'vendor': vendor,
                'evidence_type': 'Technographic signal — requires validation',
                'evidence_summary': 'TheirStack lists %s among companies using %s (seen on %d public TheirStack page(s); TheirStack reports %s companies for this technology).' % (c['name'], vendor, len(urls), total),
                'evidence_quote': '', 'source_url': urls[0],
                'source_publication_date': '2026-10-05',
                'second_source_url': urls[1] if len(urls) > 1 else '', 'third_source_url': urls[2] if len(urls) > 2 else '',
                'first_detected_date': '', 'last_detected_date': '', 'theirstack_jobs_count': '', 'theirstack_confidence': '',
                'theirstack_slug': slug, 'theirstack_vendor_company_count': total,
                'status': status, 'status_reason': reason, 'confidence_score': conf,
                'unhappy_type': '', 'complaint_category': '', 'complaint_summary': '', 'complaint_url': '', 'complaint_date': '',
                'left_tool': '', 'now_tool': '', 'workforce_signals': '', 'contacts': [],
                'company_linkedin': '', 'company_phone': '', 'public_email': '', 'contact_source_url': '',
                'pitch_angle': '', 'validation_target': bool(status != 'DO_NOT_TARGET' and slug not in NO_VALIDATE and emp and 25 <= emp <= 2500 and TARGET_IND.search(c['industry'] or '')),
                'notes': 'Public TheirStack pages do not show first/last detected dates, jobs count or TheirStack confidence (login/API only). source_publication_date = date the page was read.',
            }
            v = val.get('%s|%s' % (c['name'], vendor))
            if v:
                for k, x in v.items():
                    if k == 'notes':
                        r['notes'] = (r['notes'] + ' ' + x).strip()
                    else:
                        r[k] = x
            out.append(r)
    out.sort(key=lambda r: (r['vendor'], -(r['confidence_score']), r['company_name']))
    json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
    from collections import Counter
    print('wrote', len(out), 'skipped-known', skipped, Counter(r['status'] for r in out),
          'targets', sum(r['validation_target'] for r in out))


if __name__ == '__main__':
    main()
