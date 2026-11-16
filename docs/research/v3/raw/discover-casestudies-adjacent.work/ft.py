import sys as _s
ARGS=[l.strip() for a in _s.argv[1:] for l in (open(a[1:]).read().split() if a.startswith('@') else [a]) if l.strip()]
"""Usage: LIM=4000 python3 ft.py url [url...] — fetch, strip HTML, print dates + text."""
import sys, re, subprocess, html, os
def get(u):
    return subprocess.run(["curl", "-sL", "-m", "40", "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36", u], capture_output=True).stdout.decode('utf-8', 'ignore')
lim = int(os.environ.get('LIM', '4000'))
skip = int(os.environ.get('SKIP', '0'))
for u in ARGS:
    h = get(u)
    dates = set(re.findall(r'"(?:datePublished|dateModified|publishedAt|updatedAt)"\s*:\s*"([^"]+)"', h)) | set(re.findall(r'article:(?:published|modified)_time" content="([^"]+)"', h))
    t = re.sub(r'(?is)<(script|style|noscript|svg|header|footer|nav)[^>]*>.*?</\1>', ' ', h)
    t = re.sub(r'(?s)<[^>]+>', ' ', t); t = html.unescape(t); t = re.sub(r'\s+', ' ', t)
    mk = os.environ.get('MARK')
    if mk and t.rfind(mk) >= 0: t = t[t.rfind(mk):]
    print("=====", u, "DATES:", sorted(dates)[:4], "LEN", len(t))
    print(t[skip:skip + lim])
