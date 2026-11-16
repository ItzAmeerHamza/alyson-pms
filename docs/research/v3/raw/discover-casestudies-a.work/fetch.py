"""Fetch URLs (one per line on argv or file) and save plain-text extracts into pages/<slug>.txt.
Captures title, meta description, published/modified meta, JSON-LD dates, and body text."""
import sys, os, re, html, subprocess, hashlib
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pages', exist_ok=True)
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

def slug(u):
    s = re.sub(r'^https?://(www\.)?', '', u).strip('/').replace('/', '__')
    return re.sub(r'[^A-Za-z0-9_.-]', '_', s)[:150]

def extract(raw):
    meta = []
    t = re.search(r'<title[^>]*>(.*?)</title>', raw, re.S | re.I)
    if t: meta.append('TITLE: ' + html.unescape(t.group(1).strip()))
    for m in re.finditer(r'<meta[^>]+>', raw, re.I):
        tag = m.group(0)
        if re.search(r'(description|published|modified|og:title|date)', tag, re.I):
            meta.append('META: ' + html.unescape(tag))
    for m in re.finditer(r'"(datePublished|dateModified|uploadDate)"\s*:\s*"([^"]+)"', raw):
        meta.append(f'LD: {m.group(1)}={m.group(2)}')
    body = re.sub(r'<(script|style|noscript|svg)[^>]*>.*?</\1>', ' ', raw, flags=re.S | re.I)
    body = re.sub(r'<br\s*/?>|</(p|div|h\d|li|section|tr)>', '\n', body, flags=re.I)
    body = re.sub(r'<[^>]+>', ' ', body)
    body = html.unescape(body)
    body = re.sub(r'[ \t\r\f\v]+', ' ', body)
    body = re.sub(r'\n\s*\n+', '\n', body)
    return '\n'.join(meta) + '\n----\n' + body.strip()

urls = []
for a in sys.argv[1:]:
    if os.path.exists(a):
        urls += [l.split('\t')[1] if '\t' in l else l.strip() for l in open(a) if l.strip()]
    else:
        urls.append(a)
for u in urls:
    fn = 'pages/' + slug(u) + '.txt'
    if os.path.exists(fn) and os.path.getsize(fn) > 500:
        continue
    try:
        raw = subprocess.run(['curl', '-sL', '-m', '30', '-A', UA, u], capture_output=True).stdout.decode('utf-8', 'ignore')
    except Exception as e:
        raw = ''
    open(fn, 'w').write('URL: ' + u + '\n' + extract(raw))
    print(len(raw), fn)
