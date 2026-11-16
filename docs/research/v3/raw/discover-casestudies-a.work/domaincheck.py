"""Check each record's company_domain: fetch home page title and see if a company-name token appears.
Writes domain_check.json {domain: True/False}. Skips domains already in contact_*.json-verified list."""
import json, os, re, subprocess, html, glob
os.chdir(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/124 Safari/537.36'
pairs = {}
for f in glob.glob('rec/*.json'):
    for r in json.load(open(f)):
        d = r.get('company_domain', '')
        if d:
            pairs.setdefault(d, r['company_name'])
res = json.load(open('domain_check.json')) if os.path.exists('domain_check.json') else {}
for d, name in sorted(pairs.items()):
    if d in res:
        continue
    raw = subprocess.run(['curl', '-sL', '-m', '45', '-A', UA, 'https://' + d], capture_output=True).stdout.decode('utf-8', 'ignore')
    t = re.search(r'<title[^>]*>(.*?)</title>', raw, re.S | re.I)
    title = html.unescape(t.group(1)).strip() if t else ''
    toks = [w for w in re.findall(r'[a-z0-9]+', name.lower()) if len(w) > 3 and w not in ('solutions', 'group', 'technologies', 'services', 'formerly', 'private', 'limited')]
    blob = (title + ' ' + raw[:200000]).lower()
    ok = any(w in blob for w in toks) if toks else bool(title)
    res[d] = bool(ok and raw)
    print(d, '|', name, '|', title[:70], '|', res[d])
json.dump(res, open('domain_check.json', 'w'), indent=1)
