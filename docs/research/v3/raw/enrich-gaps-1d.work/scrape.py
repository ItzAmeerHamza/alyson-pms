import sys, re, subprocess, html

def cf(h):
    b = bytes.fromhex(h); k = b[0]
    return ''.join(chr(c ^ k) for c in b[1:])

for url in sys.argv[1:]:
    try:
        t = subprocess.run(['curl', '-sL', '-m', '25', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', url],
                           capture_output=True, timeout=40).stdout.decode('utf-8', 'ignore')
    except Exception as e:
        print('##', url, 'ERR', e); continue
    t2 = html.unescape(t)
    emails = set(re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', t2))
    emails |= {cf(h) for h in re.findall(r'data-cfemail="([0-9a-f]+)"', t)}
    emails = {e for e in emails if not re.search(r'\.(png|jpg|jpeg|gif|svg|webp|js|css)$', e, re.I) and 'sentry' not in e and 'example' not in e and 'wixpress' not in e}
    tels = set(re.findall(r'tel:([+\d\s().-]{7,})', t2))
    li = set(re.findall(r'https?://[\w.]*linkedin\.com/(?:company|in|school)/[^"\'\s<>?]+', t2))
    print('##', url, 'len', len(t))
    print(' emails:', sorted(emails)[:15])
    print(' tel:', sorted(tels)[:10])
    print(' linkedin:', sorted(li)[:10])
