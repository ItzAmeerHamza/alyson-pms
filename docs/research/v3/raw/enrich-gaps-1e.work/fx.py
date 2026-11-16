import sys, re, html, subprocess
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'
for u in sys.argv[1:]:
    t = subprocess.run(['curl', '-sL', '--max-time', '20', '-A', UA, u], capture_output=True, text=True, errors='ignore').stdout
    print('==', u, len(t))
    print(' title', [x.strip() for x in re.findall(r'<title[^>]*>(.*?)</title>', t, re.S)[:1]])
    em = set(re.findall(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}', t))
    em = {e for e in em if not re.search(r'\.(png|jpg|jpeg|svg|webp|js|css|gif)$|sentry|wixpress|example|core@|@2x|@\d', e)}
    for h in re.findall(r'data-cfemail="([0-9a-f]+)"', t):
        k = int(h[:2], 16)
        em.add(''.join(chr(int(h[i:i + 2], 16) ^ k) for i in range(2, len(h), 2)))
    print(' emails', sorted(em)[:12])
    print(' tel', sorted(set(re.findall(r'tel:([^"\'<]+)', t)))[:10])
    print(' li', sorted(set(re.findall(r'linkedin\.com/(?:in|company|school)/[^"\'\s<>?\\]+', t)))[:10])
    if '--text' in sys.argv[0:1] or 'TEXT' in __import__('os').environ:
        x = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
        x = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' | ', x)))
        kw = __import__('os').environ.get('KW', 'CEO|Founder|Director|Owner|President|COO|Partner|Manager|Head')
        for m in re.finditer(r'.{0,100}(?:%s).{0,100}' % kw, x):
            print('  >', m.group(0))
