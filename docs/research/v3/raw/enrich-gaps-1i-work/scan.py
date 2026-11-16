"""Fetch a list of URLs and print lines near leadership titles, phones, emails, LinkedIn links.
Usage: python3 scan.py URL [URL ...]"""
import sys, re, html, subprocess

PAT = re.compile(r'(CEO|C\.E\.O|Founder|Co-Founder|President|Chief [A-Z][a-z]+ Officer|COO|Managing (Director|Partner)|'
                 r'Owner|Principal|Director|Head of|Registrar|Vice[- ]Chancellor|Rector|Dean|Partner|'
                 r'\+?\(?\d{2,4}\)?[ .-]\d{3,4}[ .-]\d{3,4}|[\w.+-]+@[\w-]+\.[\w.]+)')


def fetch(u):
    r = subprocess.run(['curl', '-sL', '-m', '25', '-A',
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', u],
                       capture_output=True, text=True, errors='ignore')
    return r.stdout


for u in sys.argv[1:]:
    t = fetch(u)
    print('=====', u, len(t))
    links = sorted(set(re.findall(r'https?://[a-z.]*linkedin\.com/(?:company|in|school)/[^"\'\s<>?]+', t)))
    mails = sorted(set(re.findall(r'mailto:([^"\'?<>\s]+)', t)))
    tels = sorted(set(re.findall(r'tel:([^"\'<>]+)', t)))
    cf = re.findall(r'data-cfemail="([0-9a-f]+)"', t)
    for h in cf:
        k = int(h[:2], 16)
        mails.append(''.join(chr(int(h[i:i + 2], 16) ^ k) for i in range(2, len(h), 2)))
    print('LINKEDIN:', links)
    print('MAILTO:', mails)
    print('TEL:', tels)
    body = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', t, flags=re.S)
    s = ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', body)).split())
    seen = 0
    for m in PAT.finditer(s):
        print('  ..', s[max(0, m.start() - 70):m.end() + 50])
        seen += 1
        if seen > 25:
            break
