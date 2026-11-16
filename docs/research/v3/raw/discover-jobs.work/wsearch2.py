"""Generic-phrase Workable searches; flag any vendor name in text. Output wk_hits2.json (new only)."""
import json, re, urllib.request, urllib.parse, os, time, sys
D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
VEND = [('Time Doctor', r'time ?doctor'), ('Hubstaff', r'hubstaff'), ('Insightful', r'insightful(\.io)?(?= (time|monitor|tracking|software|app|tool|\())'),
 ('DeskTime', r'desktime'), ('Time Champ', r'time ?champ'), ('WebWork', r'webwork'), ('ActivTrak', r'activ ?trak'),
 ('Teramind', r'teramind'), ('Monitask', r'monitask'), ('Apploye', r'apploye'), ('Traqq', r'traqq'), ('TimeCamp', r'timecamp'),
 ('Controlio', r'controlio'), ('Clockify', r'clockify'), ('Toggl', r'toggl'), ('Jibble', r'jibble'), ('Everhour', r'everhour'),
 ('QuickBooks Time', r'quickbooks time|tsheets'), ('Timeero', r'timeero'), ('Harvest', r'harvest (app|time)'), ('We360.ai', r'we360'),
 ('ProHance', r'prohance'), ('Kickidler', r'kickidler'), ('Workstatus', r'workstatus'), ('EmpMonitor', r'empmonitor'), ('Hubstaff', r'hub staff')]
QS = sys.argv[1:] or ['time tracker', 'time tracking software', 'screenshots', 'monitoring software', 'activity tracking', 'productivity tracker',
      'tracked hours', 'screen monitoring', 'time doctor', 'hubstaff', 'teramind', 'desktime', 'insightful', 'clockify', 'toggl track',
      'jibble', 'everhour', 'harvest', 'timecamp', 'webwork', 'time champ', 'monitask', 'traqq', 'apploye', 'controlio', 'timeero',
      'tracking software installed', 'time-tracking', 'virtual assistant', 'remote philippines', 'offshore', 'call center agent']
prev = set()
for f in ('wk_hits.json', 'wk_hits2.json'):
    p = os.path.join(D, f)
    if os.path.exists(p):
        for x in json.load(open(p)): prev.add((x['url'], x['vendor']))
old = json.load(open(os.path.join(D, 'wk_hits2.json'))) if os.path.exists(os.path.join(D, 'wk_hits2.json')) else []
out = {}
def get(url):
    for _ in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30))
        except Exception as e:
            err = e; time.sleep(2)
    print('ERR', url, err); return None
for q in QS:
    token = None; pages = 0; n0 = len(out)
    while pages < 12:
        d = get('https://jobs.workable.com/api/v1/jobs?' + urllib.parse.urlencode({'query': q, **({'pageToken': token} if token else {})}))
        if not d: break
        for j in d.get('jobs', []):
            text = ' '.join(j.get(k) or '' for k in ('description', 'requirementsSection', 'benefitsSection'))
            text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', text)).replace('&amp;', '&')
            for vendor, pat in VEND:
                m = re.search(pat, text, re.I)
                if not m or (j['url'], vendor) in prev: continue
                prev.add((j['url'], vendor))
                out[(j['url'], vendor)] = {'vendor': vendor, 'company': j['company']['title'], 'website': j['company'].get('website'),
                    'title': j['title'], 'created': j['created'][:10], 'url': j['url'], 'country': (j.get('location') or {}).get('countryName'),
                    'ctx': text[max(0, m.start()-220):m.end()+160], 'intro': text[:250], 'q': q}
        token = d.get('nextPageToken'); pages += 1
        if not token or not d.get('jobs'): break
    print(q, len(out) - n0)
json.dump(old + list(out.values()), open(os.path.join(D, 'wk_hits2.json'), 'w'), indent=1, ensure_ascii=False)
print('new', len(out))
