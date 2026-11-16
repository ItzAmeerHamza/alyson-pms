#!/usr/bin/env python3
"""kw.py URL kw1,kw2 [width] : print text context around keywords (case-insensitive)."""
import sys, re, subprocess, html
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
u, kws = sys.argv[1], [k for k in sys.argv[2].split(',') if k]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 160
s = subprocess.run(['curl', '-sL', '-m', '25', '--compressed', '-A', UA, u], capture_output=True).stdout.decode('utf-8', 'replace')
txt = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', ' ', s, flags=re.S | re.I)
txt = html.unescape(re.sub(r'<[^>]+>', ' ', txt)); txt = re.sub(r'\s+', ' ', txt)
print(f'=== {u} textlen={len(txt)}')
seen = []
for k in kws:
    for n, m in enumerate(re.finditer(re.escape(k), txt, re.I)):
        if n >= 4: break
        a = max(0, m.start() - w)
        if any(abs(a - b) < w for b in seen): continue
        seen.append(a)
        print(f'  [{k}] ...{txt[a:m.end() + w]}...')
