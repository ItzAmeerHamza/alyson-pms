"""Fetch a company site (home + common pages) and print title, emails, phones, linkedin links, leadership snippets."""
import re, sys, urllib.request, html
PAGES = ['', '/contact', '/contact-us', '/about', '/about-us', '/team']
def get(u):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/120'}), timeout=8)
        return r.geturl(), r.read().decode('utf-8', 'ignore')
    except Exception as e:
        return None, ''
for dom in sys.argv[1:]:
    base = dom if dom.startswith('http') else 'https://' + dom
    print('=====', dom)
    emails, phones, lis, lead = set(), set(), set(), []
    for p in PAGES:
        url, h = get(base.rstrip('/') + p)
        if not h: continue
        if p == '':
            t = re.search(r'<title[^>]*>(.*?)</title>', h, re.S | re.I)
            print('final', url, '| title:', html.unescape(t.group(1).strip())[:120] if t else '')
            d = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]+)"', h, re.I)
            if d: print('desc:', html.unescape(d.group(1))[:200])
        emails |= set(e for e in re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', h) if not re.search(r'\.(png|jpg|svg|webp|gif)$|sentry|wixpress|example|domain\.com', e))
        phones |= set(re.findall(r'tel:([+\d\-\s().]{7,20})', h))
        lis |= set(re.findall(r'linkedin\.com/(?:company|in)/[\w\-%.]+', h))
        txt = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', h, flags=re.S))))
        for m in re.finditer(r'([A-Z][a-z]+ [A-Z][a-zA-Z\-]+)[\s,|–-]{1,4}(Founder|Co-Founder|CEO|Chief Executive Officer|COO|President|Managing Director|Owner|Principal|Partner|Chief Operating Officer|Director)', txt):
            lead.append(m.group(0))
    print('emails:', sorted(emails)[:8]); print('phones:', sorted(phones)[:5]); print('linkedin:', sorted(lis)[:10])
    print('leaders:', list(dict.fromkeys(lead))[:10])
