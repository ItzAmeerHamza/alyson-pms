"""Fetch archived (Wayback id_) pages and print title + first text after MARK. Usage: python3 wbt.py YEAR @file_of_urls"""
import sys, re, subprocess, html, os, json
from concurrent.futures import ThreadPoolExecutor
year = sys.argv[1]
ARGS = [l.strip() for a in sys.argv[2:] for l in (open(a[1:]).read().split() if a.startswith('@') else [a]) if l.strip()]
MK = os.environ.get('MARK', ''); LIM = int(os.environ.get('LIM', '400'))
def run(u):
    h = subprocess.run(["curl", "-sL", "-m", "60", f"https://web.archive.org/web/{year}id_/{u}"], capture_output=True).stdout.decode('utf-8', 'ignore')
    ti = re.search(r'<title>(.*?)</title>', h, re.S)
    t = re.sub(r'(?is)<(script|style|noscript|svg|header|footer|nav)[^>]*>.*?</\1>', ' ', h)
    t = re.sub(r'(?s)<[^>]+>', ' ', t); t = html.unescape(t); t = re.sub(r'\s+', ' ', t)
    i = t.find(MK) if MK else 0
    return u, html.unescape(ti.group(1).strip()) if ti else '?', t[max(i, 0):max(i, 0) + LIM]
for u, ti, t in ThreadPoolExecutor(5).map(run, ARGS):
    print("=====", u.rsplit('/', 2)[-2], "|", ti); print("   ", t)
