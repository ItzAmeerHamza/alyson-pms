"""Search himalayas.app jobs API for vendor names; save hm_hits.json"""
import json, re, urllib.request, urllib.parse, os, time
D = os.path.dirname(os.path.abspath(__file__))
VEND = [('Time Doctor', r'time ?doctor'), ('Hubstaff', r'hubstaff'), ('Insightful', r'insightful(\.io)?(?= (time|monitor|tracking|software|app|tool|\())'),
 ('DeskTime', r'desktime'), ('Time Champ', r'time ?champ'), ('WebWork', r'webwork'), ('ActivTrak', r'activ ?trak'),
 ('Teramind', r'teramind'), ('Monitask', r'monitask'), ('Apploye', r'apploye'), ('Traqq', r'traqq'), ('TimeCamp', r'timecamp'),
 ('Controlio', r'controlio'), ('Clockify', r'clockify'), ('Toggl', r'toggl'), ('Jibble', r'jibble'), ('Everhour', r'everhour'),
 ('QuickBooks Time', r'quickbooks time|tsheets'), ('Timeero', r'timeero'), ('Harvest', r'harvest( app| time|\.com|,| or )'), ('We360.ai', r'we360'),
 ('ProHance', r'prohance'), ('Kickidler', r'kickidler'), ('Workstatus', r'workstatus'), ('EmpMonitor', r'empmonitor')]
QS = ['time doctor', 'timedoctor', 'hubstaff', 'insightful', 'desktime', 'time champ', 'webwork', 'activtrak', 'teramind', 'monitask',
      'apploye', 'traqq', 'timecamp', 'controlio', 'clockify', 'toggl', 'jibble', 'harvest', 'everhour', 'quickbooks time', 'tsheets',
      'timeero', 'time tracker', 'time tracking software', 'screenshots', 'monitoring software', 'productivity tracker']
out = {}
def get(url):
    for _ in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30))
        except Exception as e:
            err = e; time.sleep(3)
    print('ERR', url, err); return None
for q in QS:
    off = 0; n0 = len(out)
    while off < 400:
        d = get('https://himalayas.app/jobs/api/search?' + urllib.parse.urlencode({'q': q, 'limit': 20, 'offset': off}))
        if not d or not d.get('jobs'): break
        for j in d['jobs']:
            text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', j.get('description') or '')).replace('&amp;', '&')
            for vendor, pat in VEND:
                m = re.search(pat, text, re.I)
                if not m: continue
                key = (j.get('guid') or j.get('applicationLink'), vendor)
                if key in out: continue
                out[key] = {'vendor': vendor, 'company': j.get('companyName'), 'slug': j.get('companySlug'), 'title': j.get('title'),
                            'created': time.strftime('%Y-%m-%d', time.gmtime(j.get('pubDate') or 0)), 'url': j.get('applicationLink') or j.get('guid'),
                            'guid': j.get('guid'), 'loc': j.get('locationRestrictions'), 'ctx': text[max(0, m.start()-220):m.end()+160], 'intro': text[:250], 'q': q}
        off += 20
        if off >= (d.get('totalCount') or 0): break
        time.sleep(0.5)
    print(q, len(out) - n0, flush=True)
json.dump(list(out.values()), open(os.path.join(D, 'hm_hits.json'), 'w'), indent=1, ensure_ascii=False)
print('total', len(out))
