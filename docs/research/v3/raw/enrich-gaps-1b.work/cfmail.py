"""Fetch a page and print visible emails, Cloudflare-decoded emails, tel: links and linkedin links."""
import re, sys, urllib.request
url = sys.argv[1]
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh) Chrome/120"})
try:
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
except Exception as ex:
    print("ERR", url, ex); sys.exit(0)
found = set()
for h in re.findall(r'data-cfemail="([0-9a-f]+)"', html) + re.findall(r'/cdn-cgi/l/email-protection#([0-9a-f]+)', html):
    k = int(h[:2], 16)
    found.add("CF: " + "".join(chr(int(h[i:i+2], 16) ^ k) for i in range(2, len(h), 2)))
for e in re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+', html):
    if not e.endswith(('.png', '.jpg', '.webp', '.svg', '.gif')):
        found.add("EMAIL: " + e)
for t in re.findall(r'href="tel:([^"]+)"', html):
    found.add("TEL: " + t)
for l in re.findall(r'https?://[\w.]*linkedin\.com/[^"\'\s<>]+', html):
    found.add("LI: " + l)
for f in sorted(found):
    print(f)
