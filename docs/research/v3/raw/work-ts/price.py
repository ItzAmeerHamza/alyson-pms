"""Fetch a pricing page's raw HTML (incl. inline JSON) and print text windows around prices."""
import ts, re, sys, html as H

for url in sys.argv[1:]:
    h, c = ts.fetch(url, sleep=0.1)
    print('=====', c, url, len(h))
    body = re.sub(r'<style.*?</style>', ' ', h, flags=re.S)
    txt = H.unescape(re.sub(r'<[^>]+>', ' ', body))
    txt = re.sub(r'\\u0024', '$', txt)
    txt = re.sub(r'\s+', ' ', txt)
    seen = set(); n = 0
    for m in re.finditer(r'(?:\$|€|£|USD ?)\s?\d+(?:[.,]\d+)?', txt):
        a = max(0, m.start() - 110); w = txt[a:m.end() + 70]
        key = w[90:150]
        if key in seen:
            continue
        seen.add(key); print('  ..', w); n += 1
        if n > int(__import__('os').environ.get('N', '18')):
            break
