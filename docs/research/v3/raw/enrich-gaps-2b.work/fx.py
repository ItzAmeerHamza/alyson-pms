#!/usr/bin/env python3
"""fx.py URL [URL...] [-t] [-x] [-k kw1,kw2] : fetch page, print title, links of interest, optionally text."""
import sys, re, subprocess, html
from urllib.parse import urljoin, urlparse
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
args = sys.argv[1:]
showtext = '-t' in args
noext = '-x' in args
kws = []
if '-k' in args:
    i = args.index('-k'); kws = [k for k in args[i + 1].lower().split(',') if k]; del args[i:i + 2]
args = [a for a in args if a not in ('-t', '-x')]
SKIP = ['google', 'facebook', 'twitter', 'x.com', 'instagram', 'youtube', 'cloudflare', 'gstatic', 'wp.org',
        'wordpress', 'schema.org', 'apple.com', 'w3.org', 'gravatar', 'pinterest', 'tiktok', 'cookie', 'hubspot',
        'jsdelivr', 'fonts', 'jquery', 'bootstrap']


def fetch(u):
    r = subprocess.run(['curl', '-sL', '-m', '25', '--compressed', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9',
                        '-w', '\n__CODE__%{http_code} %{url_effective}', u], capture_output=True)
    return r.stdout.decode('utf-8', 'replace')


for u in args:
    s = fetch(u)
    m = re.search(r'__CODE__(\S+) (\S+)\s*$', s)
    code, eff = (m.group(1), m.group(2)) if m else ('?', u)
    s = s[:m.start()] if m else s
    t = re.search(r'<title[^>]*>(.*?)</title>', s, re.S | re.I)
    print(f"=== {u} -> {code} {eff} len={len(s)}\nTITLE: {html.unescape(t.group(1).strip()) if t else ''}")
    host = urlparse(eff).netloc.replace('www.', '')
    links = set(re.findall(r'href=["\']([^"\']+)["\']', s, re.I))
    ext, li, mail, tel, internal = set(), set(), set(), set(), set()
    for l in links:
        l = html.unescape(l)
        if l.startswith('mailto:'):
            mail.add(l[7:].split('?')[0]); continue
        if l.startswith('tel:'):
            tel.add(l[4:]); continue
        a = urljoin(eff, l); h = urlparse(a).netloc.replace('www.', '')
        if 'linkedin.com' in h:
            li.add(a)
        elif h and h != host and not any(x in h for x in SKIP):
            ext.add(a.split('?')[0])
        elif h == host and re.search(r'about|team|leader|contact|staff|people|who-we|our-|impress|imprint|privacy|kontakt|sobre|equipe|quem|management|board', a, re.I):
            internal.add(a.split('#')[0])
    txt = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', ' ', s, flags=re.S | re.I)
    txt = html.unescape(re.sub(r'<[^>]+>', ' ', txt)); txt = re.sub(r'\s+', ' ', txt)
    mail |= set(re.findall(r'[\w.+-]+@[\w-]+\.[a-zA-Z][\w.-]*', txt))
    for enc in re.findall(r'(?:data-cfemail="|/cdn-cgi/l/email-protection#)([0-9a-f]+)', s):
        k = int(enc[:2], 16)
        mail.add('CF:' + ''.join(chr(int(enc[i:i + 2], 16) ^ k) for i in range(2, len(enc), 2)))
    print('LINKEDIN:', sorted(li))
    print('MAIL:', sorted(x for x in mail if not x.lower().endswith(('.png', '.jpg', '.webp', '.svg', '.gif'))))
    print('TEL:', sorted(tel))
    print('INTERNAL:', sorted(internal)[:25])
    if not noext:
        print('EXT:', sorted(ext)[:60])
    phones = set(re.findall(r'(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}', txt))
    print('PHONES_TXT:', sorted(phones)[:10])
    for k in kws:
        for n, mm in enumerate(re.finditer(re.escape(k), txt, re.I)):
            if n >= 6: break
            print(f'  [{k}] ...{txt[max(0, mm.start() - 150):mm.end() + 150]}...')
    if showtext:
        print('TEXT:', txt[:6000])
