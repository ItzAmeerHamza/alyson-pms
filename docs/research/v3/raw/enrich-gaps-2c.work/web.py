import sys,re
from f import get
from crawl import text
# print the html around "Website" label and quote/person blocks
for u in sys.argv[1:]:
    h=get(u)
    print('==',u)
    for m in re.finditer(r'Website',h):
        seg=h[m.start()-50:m.start()+600]
        hs=re.findall(r'href="([^"]+)"',seg)
        print('  W',hs[:3], text(seg)[:120])
    t=text(h)
    m=re.search(r'Location (.{0,80})',t)
    if m: print('  LOC',m.group(0)[:120])
