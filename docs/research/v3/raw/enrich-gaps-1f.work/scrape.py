import sys, re, html, urllib.request, ssl
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
for url in sys.argv[1:]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "text/html"})
        t = urllib.request.urlopen(req, timeout=20, context=ctx).read().decode('utf-8', 'ignore')
    except Exception as e:
        print(url, 'ERR', e); continue
    cf = []
    for h in re.findall(r'data-cfemail="([0-9a-f]+)"', t):
        k = int(h[:2], 16); cf.append(''.join(chr(int(h[i:i+2], 16) ^ k) for i in range(2, len(h), 2)))
    emails = sorted(set(e for e in re.findall(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+', t) if not re.search(r'\.(png|jpg|svg|webp|gif|js|css)$', e) and 'sentry' not in e and 'wixpress' not in e))
    tels = sorted(set(re.findall(r'tel:([^"\'<>]+)', t)))
    lis = sorted(set(re.findall(r'linkedin\.com/(?:company|in|school)/[^"\'<>\s?]+', t)))
    print('==', url, 'len', len(t))
    print(' emails', emails[:12], 'cf', cf)
    print(' tel', tels[:10])
    print(' li', lis[:15])
    if '-v' in sys.argv[0:0]:
        pass
