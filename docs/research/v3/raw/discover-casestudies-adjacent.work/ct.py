import sys as _s
ARGS=[l.strip() for a in _s.argv[1:] for l in (open(a[1:]).read().split() if a.startswith('@') else [a]) if l.strip()]
"""Usage: python3 ct.py domain [domain...]
Fetch homepage + common contact/about pages; print emails, phones (tel: links), linkedin URLs found."""
import sys, re, subprocess, html
from concurrent.futures import ThreadPoolExecutor
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36"
PATHS = ["", "/contact", "/contact-us", "/about", "/about-us", "/team", "/kontakt", "/contacto", "/impressum", "/en/contact", "/privacy-policy"]
def get(u):
    try:
        r = subprocess.run(["curl", "-sL", "-m", "20", "-A", UA, "-w", "\n__CODE__%{http_code}", u], capture_output=True)
        s = r.stdout.decode('utf-8', 'ignore')
        code = s.rsplit("__CODE__", 1)[-1]
        return s if code.startswith("2") else ""
    except Exception:
        return ""
def scan(d):
    base = d if d.startswith("http") else "https://" + d
    pages = list(ThreadPoolExecutor(6).map(lambda p: (p, get(base.rstrip('/') + p)), PATHS))
    em, ph, li, ok = set(), set(), set(), []
    for p, h in pages:
        if not h: continue
        ok.append(p or "/")
        h2 = html.unescape(h)
        for e in re.findall(r'mailto:([^"\'?>\s]+)', h2): em.add(e.strip().lower())
        for e in re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', re.sub(r'<[^>]+>', ' ', h2)):
            if not re.search(r'\.(png|jpg|jpeg|gif|svg|webp|js|css)$', e, re.I) and 'sentry' not in e and 'example' not in e and 'wixpress' not in e:
                em.add(e.lower().rstrip('.'))
        for t in re.findall(r'tel:([^"\'>]+)', h2): ph.add(t.strip())
        for l in re.findall(r'https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:company|in|school|showcase)/[^"\'\s<>?]+', h2): li.add(l.rstrip('/'))
    print(f"## {d} pages={ok}")
    print("  emails:", sorted(em)[:10]); print("  phones:", sorted(ph)[:6]); print("  linkedin:", sorted(li)[:8])
for d in ARGS:
    scan(d)
