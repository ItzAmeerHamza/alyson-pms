"""Search jobs.workable.com public API for vendor names; dump hits with context to wk_hits.json"""
import json, re, urllib.request, urllib.parse, os, time
D = os.path.dirname(os.path.abspath(__file__))
VENDORS = {
 'Time Doctor': r'time ?doctor', 'Hubstaff': r'hubstaff', 'Insightful': r'insightful(\.io)?\b(?=[^.]{0,60}(track|monitor|software|app|tool))',
 'DeskTime': r'desktime', 'Time Champ': r'time ?champ', 'WebWork': r'webwork', 'ActivTrak': r'activ ?trak',
 'Teramind': r'teramind', 'Monitask': r'monitask', 'Apploye': r'apploye', 'Traqq': r'traqq', 'TimeCamp': r'timecamp',
 'Controlio': r'controlio', 'Clockify': r'clockify', 'Toggl': r'toggl', 'Jibble': r'jibble',
 'Harvest': r'\bharvest\b(?=[^.]{0,40}(time|track|app|software|forecast))', 'Everhour': r'everhour',
 'QuickBooks Time': r'quickbooks time|tsheets', 'Timeero': r'timeero',
}
QUERIES = {'Time Doctor': ['time doctor', 'timedoctor'], 'Insightful': ['insightful time tracking', 'insightful monitoring'],
           'Harvest': ['harvest time tracking', 'harvest app'], 'QuickBooks Time': ['quickbooks time', 'tsheets'],
           'Toggl': ['toggl'], 'Time Champ': ['time champ'], 'ActivTrak': ['activtrak']}
out = {}
def get(url):
    for _ in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30))
        except Exception as e:
            err = e; time.sleep(2)
    print('ERR', url, err); return None
for vendor, pat in VENDORS.items():
    rx = re.compile(pat, re.I)
    for q in QUERIES.get(vendor, [vendor.lower()]):
        token = None; pages = 0
        while pages < 15:
            url = 'https://jobs.workable.com/api/v1/jobs?' + urllib.parse.urlencode({'query': q, **({'pageToken': token} if token else {})})
            d = get(url)
            if not d: break
            for j in d.get('jobs', []):
                text = ' '.join(j.get(k) or '' for k in ('description', 'requirementsSection', 'benefitsSection'))
                text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', text)).replace('&amp;', '&')
                m = rx.search(text)
                if not m: continue
                key = (j['id'], vendor)
                if key in out: continue
                out[key] = {'vendor': vendor, 'company': j['company']['title'], 'website': j['company'].get('website'),
                            'title': j['title'], 'created': j['created'][:10], 'url': j['url'],
                            'country': (j.get('location') or {}).get('countryName'), 'workplace': j.get('workplace'),
                            'ctx': text[max(0, m.start()-220):m.end()+160], 'intro': text[:250]}
            token = d.get('nextPageToken'); pages += 1
            if not token or not d.get('jobs'): break
    print(vendor, sum(1 for k in out if k[1] == vendor))
json.dump(list(out.values()), open(os.path.join(D, 'wk_hits.json'), 'w'), indent=1, ensure_ascii=False)
print('total', len(out))
