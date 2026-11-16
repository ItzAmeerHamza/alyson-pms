"""OnlineJobs.ph site search per vendor keyword -> fetch job pages -> oj_hits.json (date, quote, overview)."""
import re, html, json, os, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'oj_hits.json')
VEND = {'Time Doctor': r'time ?doctor', 'Hubstaff': r'hubstaff', 'Insightful': r'insightful(\.io)?(?= ?(time|monitor|tracking|software|app|tool|\(|for))',
 'DeskTime': r'desktime', 'Time Champ': r'time ?champ', 'WebWork': r'webwork', 'ActivTrak': r'activ ?trak', 'Teramind': r'teramind',
 'Monitask': r'monitask', 'Apploye': r'apploye', 'Traqq': r'traqq', 'TimeCamp': r'timecamp', 'Controlio': r'controlio',
 'Clockify': r'clockify', 'Toggl': r'toggl', 'Jibble': r'jibble', 'Everhour': r'everhour', 'QuickBooks Time': r'quickbooks time|tsheets',
 'Timeero': r'timeero', 'Harvest': r'harvest (app|time)', 'We360.ai': r'we360', 'ProHance': r'prohance', 'Workstatus': r'workstatus', 'EmpMonitor': r'empmonitor'}
KW = sys.argv[1:] or ['hubstaff', 'time doctor', 'timedoctor', 'insightful', 'desktime', 'time champ', 'webwork', 'activtrak', 'teramind',
      'monitask', 'apploye', 'traqq', 'timecamp', 'controlio', 'clockify', 'toggl', 'jibble', 'everhour', 'tsheets', 'quickbooks time', 'timeero', 'workstatus', 'we360']
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/120'}
def get(u):
    for _ in range(3):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read().decode('utf-8', 'ignore')
        except Exception: time.sleep(2)
    return ''
done = {}
if os.path.exists(OUT):
    for x in json.load(open(OUT)): done[x['url']] = x
links = {}
for kw in KW:
    n0 = len(links)
    for off in range(0, 300, 30):
        u = 'https://www.onlinejobs.ph/jobseekers/jobsearch' + (f'/{off}' if off else '') + '?' + urllib.parse.urlencode({'jobkeyword': kw})
        h = get(u)
        found = set(re.findall(r'href="(/jobseekers/job/[^"#?]+)"', h))
        new = [f for f in found if f not in links]
        for f in found: links.setdefault(f, kw)
        if not found or not new: break
    print(kw, len(links) - n0, flush=True)
todo = ['https://www.onlinejobs.ph' + l for l in links if 'https://www.onlinejobs.ph' + l not in done]
print('fetch', len(todo), flush=True)
def job(u):
    h = get(u)
    if not h: return None
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', h, flags=re.S)
    t = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' | ', t)))
    t = re.sub(r'(\|\s*)+', '| ', t)
    title = (re.search(r'<title>(.*?)</title>', h, re.S) or [None, ''])[1].strip()
    date = (re.search(r'DATE UPDATED \| ([A-Z][a-z]{2} \d{1,2}, \d{4})', t) or [None, ''])[1]
    i = t.find('JOB OVERVIEW'); body = t[i + 13:] if i >= 0 else t
    j = body.find('Please | login'); body = body[:j] if j > 0 else body[:6000]
    hits = []
    for v, p in VEND.items():
        m = re.search(p, body, re.I)
        if m: hits.append({'vendor': v, 'ctx': body[max(0, m.start() - 200):m.end() + 160]})
    typ = (re.search(r'TYPE OF WORK \| ([^|]+)', t) or [None, ''])[1].strip()
    return {'url': u, 'title': title, 'date': date, 'type': typ, 'hits': hits, 'overview': body[:900], 'body_len': len(body)}
with ThreadPoolExecutor(6) as ex:
    for k, r in enumerate(ex.map(job, todo)):
        if r: done[r['url']] = r
        if k % 50 == 0:
            json.dump(list(done.values()), open(OUT, 'w'), indent=1, ensure_ascii=False); print('..', k, flush=True)
json.dump(list(done.values()), open(OUT, 'w'), indent=1, ensure_ascii=False)
print('jobs', len(done), 'with vendor', sum(1 for x in done.values() if x['hits']))
