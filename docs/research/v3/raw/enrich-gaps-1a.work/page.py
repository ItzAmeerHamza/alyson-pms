"""Fetch pages and print emails / tel / linkedin links / cfemail-decoded emails, and optional text grep.
usage: python3 page.py URL [URL...] [--grep word1,word2] [--text N]"""
import sys, re, html, ssl, urllib.request

ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
args = sys.argv[1:]
grep = []; textn = 0; urls = []
i = 0
while i < len(args):
    if args[i] == "--grep": grep = args[i + 1].split(","); i += 2
    elif args[i] == "--text": textn = int(args[i + 1]); i += 2
    else: urls.append(args[i]); i += 1

def cf(h):
    k = int(h[:2], 16); return "".join(chr(int(h[j:j + 2], 16) ^ k) for j in range(2, len(h), 2))

for u in urls:
    print("==", u)
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept-Language": "en-US"})
        r = urllib.request.urlopen(req, timeout=25, context=ctx)
        t = r.read().decode("utf-8", "replace"); print("   final:", r.geturl(), len(t))
    except Exception as e:
        print("   ERR", e); continue
    emails = set(re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", t))
    emails = {e for e in emails if not re.search(r"\.(png|jpg|webp|svg|gif|js|css)$|sentry|wixpress|example\.", e)}
    emails |= {cf(h) + " (cf)" for h in re.findall(r'data-cfemail="([0-9a-f]+)"', t)}
    print("   emails:", sorted(emails))
    print("   tel:", sorted(set(re.findall(r'tel:([^"\'>]+)', t))))
    print("   linkedin:", sorted(set(re.findall(r'linkedin\.com/(?:in|company|showcase)/[^"\'\s<>?]+', t))))
    links = sorted(set(l for l in re.findall(r'href="([^"#]+)"', t)
                       if re.search(r"about|team|leader|contact|privacy|imprint|who-we|people|company|staff|management", l, re.I)
                       and "linkedin" not in l and not l.endswith((".css", ".js", ".png"))))
    print("   links:", links[:25])
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s)); s = re.sub(r"\s+", " ", s)
    if textn: print("   TEXT:", s[:textn])
    for g in grep:
        for m in list(re.finditer(re.escape(g), s))[:4]:
            print("   [%s] ...%s..." % (g, s[max(0, m.start() - 150):m.end() + 150]))
