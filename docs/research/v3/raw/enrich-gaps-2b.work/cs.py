#!/usr/bin/env python3
"""cs.py URL... : for vendor case-study pages, print non-vendor external links, linkedin links and name/title snippets."""
import sys, re, subprocess, html
from urllib.parse import urljoin, urlparse
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BAD = re.compile(r'clicktime|timely|paymo|flowace|beebole|currentware|insightful|hsforms|hs-|hubapi|website-files|cdn|g2\.com|capterra|vimeo|wistia|getapp|softwareadvice|trustradius|google|facebook|twitter|x\.com|instagram|youtube|apple\.com|cloudflare|gstatic|schema|w3\.org|wordpress|gravatar|bit\.ly|typeform|calendly|intercom|zendesk|cookie|onetrust|fonts|jquery|tiktok|pinterest|github|medium\.com|webflow|wp\.com|gmpg|ogp\.me|sharethis|addtoany|crunchbase|apps\.|chrome\.|microsoft|slack\.com|zapier|asana|trello|jira|atlassian|quickbooks|xero|hubspot|salesforce|monday\.com|clickup|notion|figma|adobe|vercel|netlify|amazonaws|gtm|doubleclick|hotjar|segment|mixpanel|stripe', re.I)
TITLES = r'(CEO|COO|CFO|CTO|President|Founder|Co-?founder|Director|Manager|Controller|Principal|Owner|Partner|Vice President|VP|Executive|Chief|Head|Lead|Administrator|Coordinator|Officer|Specialist|Accountant)'
for u in sys.argv[1:]:
    r = subprocess.run(['curl', '-sL', '-m', '25', '--compressed', '-A', UA, u], capture_output=True)
    s = r.stdout.decode('utf-8', 'replace')
    t = re.search(r'<title[^>]*>(.*?)</title>', s, re.S | re.I)
    print(f"=== {u} len={len(s)}  TITLE: {html.unescape(t.group(1).strip()) if t else ''}")
    host = urlparse(u).netloc
    ext = set()
    for l in re.findall(r'href=["\']([^"\']+)["\']', s, re.I):
        a = urljoin(u, html.unescape(l)); h = urlparse(a).netloc
        if h and h != host and not BAD.search(h) and not h.endswith(host.replace('www.', '')):
            ext.add(a.split('?')[0])
    print('EXT:', sorted(ext)[:20])
    txt = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', ' ', s, flags=re.S | re.I)
    txt = html.unescape(re.sub(r'<[^>]+>', ' ', txt)); txt = re.sub(r'\s+', ' ', txt)
    snips = set()
    for m in re.finditer(r"([A-Z][a-zé]+(?: [A-Z]\.)? [A-Z][a-zA-Z'é-]+)\s*[,|–—-]?\s*" + TITLES + r"[^.\"“”]{0,70}", txt):
        snips.add(m.group(0)[:140])
    for x in sorted(snips)[:12]:
        print('  NAME:', x)
    for m in re.finditer(r'(Website|Location|Industry|Company size|Employees|Headquarters)\s*:?\s*([^\s].{0,60})', txt):
        print('  META:', m.group(0)[:90])
