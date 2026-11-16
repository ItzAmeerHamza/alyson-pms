"""Usage: KW='regex' W=150 python3 kw.py url|@file ... — print keyword-in-context snippets (and date hints) from each page."""
import sys, re, subprocess, html, os
from concurrent.futures import ThreadPoolExecutor
ARGS = [l.strip() for a in sys.argv[1:] for l in (open(a[1:]).read().split() if a.startswith('@') else [a]) if l.strip()]
KW = re.compile(os.environ.get('KW', r'harvest|toggl|clockify|hubstaff|time doctor|timecamp|everhour|jibble|switch|migrat|moved from|replac|previous tool|spreadsheet'), re.I)
W = int(os.environ.get('W', '150')); MAXN = int(os.environ.get('N', '6'))
def get(u):
    return subprocess.run(["curl", "-sL", "-m", "30", "-A", "Mozilla/5.0 (Macintosh) Chrome/126", u], capture_output=True).stdout.decode('utf-8', 'ignore')
def run(u):
    h = get(u)
    dates = sorted(set(re.findall(r'"(?:datePublished|dateModified|publishedAt|uploadDate)"\s*:\s*"([^"]{10})', h)) | set(re.findall(r'(?:published|modified)_time" content="([^"]{10})', h)))
    t = re.sub(r'(?is)<(script|style|noscript|svg|header|footer|nav)[^>]*>.*?</\1>', ' ', h)
    t = re.sub(r'(?s)<[^>]+>', ' ', t); t = html.unescape(t); t = re.sub(r'\s+', ' ', t)
    out, last = [], -10**9
    for m in KW.finditer(t):
        if m.start() - last < W: continue
        last = m.start(); out.append(t[max(0, m.start() - W):m.end() + W])
        if len(out) >= MAXN: break
    return u, dates, out
for u, d, out in ThreadPoolExecutor(8).map(run, ARGS):
    print("=====", u, d)
    for o in out: print("  …", o)
