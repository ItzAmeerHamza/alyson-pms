import sys,re
from concurrent.futures import ThreadPoolExecutor
from f import get
def one(d):
    u=d if d.startswith('http') else 'https://'+d
    h=get(u); st=h[h.rfind('__STATUS'):].split()
    m=re.search(r'<title[^>]*>(.*?)</title>',h,re.S|re.I)
    return f"{d} | {' '.join(st[1:3])} | {(m.group(1).strip() if m else '')[:90]}"
with ThreadPoolExecutor(8) as ex:
    for line in ex.map(one,sys.argv[1:]): print(line)
