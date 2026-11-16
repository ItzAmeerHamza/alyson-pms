"""Bing RSS search helper: python3 bs.py "query" [n]  (multiple queries separated by ' ;; ')"""
import sys, urllib.request, urllib.parse, xml.etree.ElementTree as ET, html

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
for q in sys.argv[1].split(" ;; "):
    print("### Q:", q)
    url = "https://www.bing.com/search?format=rss&count=%d&q=%s" % (n, urllib.parse.quote(q))
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US"})
    try:
        data = urllib.request.urlopen(req, timeout=25).read()
        root = ET.fromstring(data)
    except Exception as e:
        print("ERR", e); continue
    for it in root.iter("item"):
        print("-", html.unescape(it.findtext("title") or ""), "|", it.findtext("link"))
        print("   ", html.unescape(it.findtext("description") or "")[:400])
