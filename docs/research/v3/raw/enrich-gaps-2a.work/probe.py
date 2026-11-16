"""Probe candidate domains: print final URL, title, and whether a keyword appears.
usage: python3 probe.py keyword dom1 dom2 ..."""
import sys, re, ssl, urllib.request
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
kw = sys.argv[1].lower()
for d in sys.argv[2:]:
    u = d if d.startswith("http") else "https://" + d
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=15, context=ctx)
        t = r.read().decode("utf-8", "replace")
        ti = re.search(r"<title[^>]*>(.*?)</title>", t, re.S | re.I)
        print("%-35s -> %s | %s | kw=%s" % (d, r.geturl(), (ti.group(1).strip()[:80] if ti else ""), kw in t.lower()))
    except Exception as e:
        print("%-35s ERR %s" % (d, str(e)[:60]))
