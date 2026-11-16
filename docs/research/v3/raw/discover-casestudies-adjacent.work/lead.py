"""Fetch pages with browser-like headers; print linkedin/tel/mailto and Name–Title leadership patterns."""
import sys, re, html, subprocess
ARGS = [l.strip() for a in sys.argv[1:] for l in (open(a[1:]).read().split() if a.startswith('@') else [a]) if l.strip()]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
for u in ARGS:
    r = subprocess.run(["curl", "-sL", "-m", "25", "-A", UA, "-H", "Accept: text/html", "-H", "Accept-Language: en", "-w", "\n__C%{http_code}", u], capture_output=True)
    h = r.stdout.decode('utf-8', 'ignore'); code = h.rsplit("__C", 1)[-1]
    li = sorted(set(re.findall(r'linkedin\.com/(?:company|in)/[^"\'\s<>?\\]+', h)))[:8]
    tel = sorted(set(re.findall(r'tel:([^"]+)', h)))[:3]; em = sorted(set(re.findall(r'mailto:([^"?]+)', h)))[:4]
    t = html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', h))); t = re.sub(r'\s+', ' ', t)
    ppl = re.findall(r'([A-Z][a-zA-Z\'-]+ [A-Z][a-zA-Z\'-]+)\s*[,|–\-:]?\s*(Chief [A-Z][a-z]+ Officer|CEO|Founder|Co-Founder|Co-founder|COO|Managing Director|President)', t)
    print("==", code, u); print("   li:", li); print("   tel:", tel, "mail:", em); print("   people:", sorted(set(ppl))[:10])
