import sys, re, subprocess, html
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
# usage: fetch.py URL [text N | links FILTER_OUT_REGEX | grep REGEX]
url = sys.argv[1]
mode = sys.argv[2] if len(sys.argv) > 2 else "text"
r = subprocess.run(["curl", "-sL", "--max-time", "25", "-A", UA, url], capture_output=True)
h = r.stdout.decode("utf-8", "ignore")
if mode == "links":
    excl = sys.argv[3] if len(sys.argv) > 3 else r"^$"
    for l in sorted(set(re.findall(r'href=["\']([^"\']+)["\']', h))):
        if l.startswith("#") or re.search(r'\.(css|js|png|jpg|svg|ico|woff2?)(\?|$)', l):
            continue
        if re.search(excl, l, re.I):
            continue
        print(l)
elif mode == "grep":
    for m in sorted(set(re.findall(sys.argv[3], h, re.I))):
        print(m)
else:
    t = re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>', ' ', h)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(re.sub(r'\s+', ' ', t))
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 6000
    print(t[:n])
