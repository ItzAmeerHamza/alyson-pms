import sys,re,json
from f import get
from crawl import text
# For case-study pages: print sentences with title-like words and "says X" patterns
B=json.load(open('../../batches/enrich-gaps-2c.json'))
idx=[int(x) for x in sys.argv[1:]]
for i in idx:
    r=B[i];h=get(r['source_url']);t=text(h)
    print('#####',i,r['company_name'],r['source_url'])
    seen=set()
    for m in re.finditer(r'([A-Z][a-zA-Z\'\-]+ ){1,3}(,? )?(Founder|Co-Founder|CEO|President|Principal|Partner|Director|Manager|Officer|Controller|VP|Vice President|Head|Owner|Coordinator|Administrator|Lead|Executive|Chief)[A-Za-z ,&]{0,50}',t):
        s=m.group(0)[:110]
        if s in seen or any(k in s for k in ['ClickTime','Paymo','Flowace','Timely','Timeero','Beebole','My Hours','Account Manager Login']): continue
        seen.add(s); print('  ',s)
        if len(seen)>14: break
    for m in re.finditer(r'(founded|based in|headquartered|located in|employees|team of)[^.]{0,120}',t,re.I):
        print('  ~',m.group(0)[:140]);
