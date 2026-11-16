import urllib.request, sys, json
from concurrent.futures import ThreadPoolExecutor
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'


def chk(u):
    try:
        req = urllib.request.Request(u, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            return u, r.status, r.geturl()
    except urllib.error.HTTPError as e:
        return u, e.code, ''
    except Exception as e:
        return u, -1, str(e)[:60]


urls = [l.strip() for l in open(sys.argv[1]) if l.strip()]
with ThreadPoolExecutor(8) as ex:
    for u, c, f in ex.map(chk, urls):
        print(c, u, '->', f if f != u else '')
