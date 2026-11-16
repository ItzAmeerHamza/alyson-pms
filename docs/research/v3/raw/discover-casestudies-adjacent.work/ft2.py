"""Like ft.py but keeps header/nav content (some sites put body in <header>). MARK=start text, LIM chars."""
import sys, re, subprocess, html, os
from concurrent.futures import ThreadPoolExecutor
ARGS = [l.strip() for a in sys.argv[1:] for l in (open(a[1:]).read().split() if a.startswith('@') else [a]) if l.strip()]
lim = int(os.environ.get('LIM', '1200')); mk = os.environ.get('MARK', '')
def get(u):
    return subprocess.run(["curl", "-sL", "-m", "40", "-A", "Mozilla/5.0 (Macintosh) Chrome/126", u], capture_output=True).stdout.decode('utf-8', 'ignore')
def run(u):
    h = get(u)
    title = (re.search(r'<title>(.*?)</title>', h, re.S) or [None, ''])[1] if re.search(r'<title>(.*?)</title>', h, re.S) else ''
    dates = sorted(set(re.findall(r'"(?:datePublished|dateModified)"\s*:\s*"([^"]{10})', h)))
    t = re.sub(r'(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>', ' ', h)
    t = re.sub(r'(?s)<[^>]+>', ' ', t); t = html.unescape(t); t = re.sub(r'\s+', ' ', t)
    i = t.find(mk) if mk else 0
    return u, html.unescape(title.strip()), dates, t[max(i, 0):max(i, 0) + lim]
for u, ti, d, t in ThreadPoolExecutor(8).map(run, ARGS):
    print("=====", u, "|", ti, d); print(t)
