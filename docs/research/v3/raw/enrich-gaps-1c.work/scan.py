import re, sys, subprocess
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
pat = re.compile(r'mailto:[^"\'?<> ]+|tel:[^"\'<> ]+|linkedin\.com/(?:company|in|school)/[^"\'/?<> ]+|data-cfemail="[0-9a-f]+"|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,10}')
def cf(h):
    k = int(h[:2], 16)
    return ''.join(chr(int(h[i:i+2], 16) ^ k) for i in range(2, len(h), 2))
for u in sys.argv[1:]:
    try:
        r = subprocess.run(['curl', '-sL', '--max-time', '20', '-A', UA, '-w', '\n%{http_code}', u], capture_output=True, text=True, errors='ignore')
        body, code = r.stdout.rsplit('\n', 1)
    except Exception as e:
        print('==', u, 'ERR', e); continue
    found = set()
    for m in pat.findall(body):
        if m.startswith('data-cfemail'):
            m = 'cf:' + cf(m.split('"')[1])
        if re.search(r'\.(png|jpg|webp|svg|gif|js|css)$', m) or 'sentry' in m or 'wixpress' in m or 'example.com' in m:
            continue
        found.add(m)
    print('==', u, code, sorted(found)[:30])
