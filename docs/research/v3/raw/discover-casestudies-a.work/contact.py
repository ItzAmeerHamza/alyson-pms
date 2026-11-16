"""contact.py domain [domain...] : fetch home + common contact/about pages; print title, emails, phones,
LinkedIn company/in links, found on the company's own site (with the URL where found)."""
import sys, os, re, subprocess, html, json
os.chdir(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
PATHS = ['', '/contact', '/contact-us', '/about', '/about-us', '/company', '/team']
BAD_EMAIL = re.compile(r'(example|domain|sentry|wixpress|\.png|\.jpg|\.webp|\.svg|@2x|godaddy|yourname|email@|name@)', re.I)
out = {}
for d in sys.argv[1:]:
    res = {'title': '', 'emails': {}, 'phones': {}, 'li_company': {}, 'li_in': {}, 'final': ''}
    for p in PATHS:
        u = f'https://{d}{p}'
        r = subprocess.run(['curl', '-sL', '-m', '12', '-A', UA, '-w', '\n__FINAL__%{url_effective} %{http_code}', u], capture_output=True)
        raw = r.stdout.decode('utf-8', 'ignore')
        m = re.search(r'__FINAL__(\S+) (\d+)$', raw)
        final, code = (m.group(1), m.group(2)) if m else (u, '0')
        if code != '200':
            continue
        if p == '':
            t = re.search(r'<title[^>]*>(.*?)</title>', raw, re.S | re.I)
            res['title'] = html.unescape(t.group(1).strip())[:120] if t else ''
            res['final'] = final
        for e in set(re.findall(r'mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', raw)) | set(re.findall(r'\b([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,6})\b', re.sub(r'<[^>]+>', ' ', raw))):
            if not BAD_EMAIL.search(e):
                res['emails'].setdefault(e.lower(), final)
        for ph in re.findall(r'href="tel:([^"]+)"', raw):
            ph = html.unescape(ph).strip()
            if len(re.sub(r'\D', '', ph)) >= 7:
                res['phones'].setdefault(ph, final)
        for li in re.findall(r'https?://(?:[a-z]{2,3}\.)?linkedin\.com/company/[A-Za-z0-9_%\-.]+', raw):
            res['li_company'].setdefault(li.rstrip('/.'), final)
        for li in re.findall(r'https?://(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9_%\-]+', raw):
            res['li_in'].setdefault(li.rstrip('/'), final)
    out[d] = res
    print('=====', d, '|', res['title'], '|', res['final'])
    for k in ['emails', 'phones', 'li_company', 'li_in']:
        if res[k]:
            print(' ', k, json.dumps(dict(list(res[k].items())[:8])))
json.dump(out, open('contact_last.json', 'w'), indent=1)
