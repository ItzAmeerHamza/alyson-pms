import json, sys, re, urllib.request
KW = re.compile(r'(time doctor|hubstaff|insightful|desktime|time champ|webwork|activtrak|teramind|monitask|apploye|traqq|timecamp|controlio|clockify|toggl|jibble|harvest|everhour|quickbooks time|tsheets|timeero|tracker|screenshot|monitor)', re.I)
for arg in sys.argv[1:]:
    acct, code = arg.split('/')
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request(f'https://apply.workable.com/api/v2/accounts/{acct}/jobs/{code}', headers={'User-Agent': 'Mozilla/5.0'})))
    except Exception as e:
        print(arg, 'ERR', e); continue
    t = re.sub(r'<[^>]+>', ' ', ' '.join(str(d.get(k, '')) for k in ('description', 'requirements', 'benefits')))
    t = re.sub(r'\s+', ' ', t)
    print('==', arg, d.get('title'), d.get('published'), d.get('location', {}).get('country'))
    print('  START:', t[:350])
    seen = 0
    for m in KW.finditer(t):
        if m.start() < seen: continue
        print('  >>', t[max(0, m.start()-200):m.end()+150]); seen = m.end()+150
