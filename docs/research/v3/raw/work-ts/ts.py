import re, sys, json, os, time, html as H, urllib.request, urllib.error

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache')
os.makedirs(CACHE, exist_ok=True)
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'


def fetch(url, sleep=0.4):
    fn = os.path.join(CACHE, re.sub(r'[^A-Za-z0-9]+', '_', url)[-180:] + '.html')
    if os.path.exists(fn):
        return open(fn, encoding='utf-8').read(), 200
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            h = r.read().decode('utf-8', 'replace'); code = r.status
    except urllib.error.HTTPError as e:
        h = ''; code = e.code
    except Exception as e:
        return '', -1
    if code == 200:
        open(fn, 'w', encoding='utf-8').write(h)
    time.sleep(sleep)
    return h, code


def clean(s):
    return re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def parse(h):
    rows = []
    for tr in re.findall(r'<tr class="border-b.*?</tr>', h, flags=re.S):
        dom = re.search(r'logo/domain/([^"]+?)\.(?:jpeg|png|jpg|webp|svg|gif)"', tr)
        name = re.search(r'title="([^"]+)" href="https://app.theirstack.com/home\?search-company', tr)
        tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, flags=re.S)
        cells = [clean(t) for t in tds]
        if name:
            rows.append({'name': H.unescape(name.group(1)), 'domain': dom.group(1) if dom else '', 'cells': cells})
    return rows


def title(h):
    m = re.search(r'<title>(.*?)</title>', h)
    return H.unescape(m.group(1)) if m else ''


def count(h):
    m = re.search(r'([\d,]+) compan(?:y|ies)\s*</', h)
    t = title(h)
    m2 = re.search(r'\(([\d,]+)\)', t)
    return m2.group(1).replace(',', '') if m2 else ''


def count_from_title(t):
    m = re.search(r'\(([\d,]+)\)', t)
    return m.group(1).replace(',', '') if m else ''


def slices(h, slug):
    return sorted(set(re.findall(r'href="/en/technology/%s/([^"#?/]+)"' % re.escape(slug), h)))


if __name__ == '__main__':
    for u in sys.argv[1:]:
        h, c = fetch(u)
        print(c, u, '|', title(h))
        for r in parse(h):
            print('  ', r)
