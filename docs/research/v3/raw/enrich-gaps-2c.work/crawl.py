import sys,re,html,urllib.parse,os
from f import get
KEYS=['about','team','leadership','contact','people','who-we-are','our-story','staff','management','impressum','imprint','privacy','kontakt','over-ons','nosotros','contacto','yhteystiedot','meista','ueber','uber-uns','board','partners','founder','company','executive','careers']
TITLES=r'(CEO|C\.E\.O|Chief [A-Z][a-z]+ Officer|Founder|Co-Founder|Co-founder|President|Managing Director|Managing Partner|Principal|Owner|COO|CFO|CTO|Director|Geschäftsführer|Toimitusjohtaja|Oprichter|Eigenaar|Fundador|Partner|Executive Director|Head of)'
def text(h):
    t=re.sub(r'(?is)<(script|style|noscript|svg).*?</\1>',' ',h);t=re.sub(r'<[^>]+>',' ',t);t=html.unescape(t);return re.sub(r'\s+',' ',t)
def crawl(start,maxp=8,extra=()):
    h=get(start); st=h[h.rfind('__STATUS'):].split()
    final=st[2] if len(st)>2 else start
    base=urllib.parse.urlparse(final).netloc
    print('#### START',start,'->',' '.join(st[1:]))
    pages=[(final,h)]
    cand=[]
    for x in re.findall(r'href=["\']([^"\'#]+)["\']',h):
        a=urllib.parse.urljoin(final,x); p=urllib.parse.urlparse(a)
        if p.netloc.replace('www.','')==base.replace('www.','') and any(k in p.path.lower() for k in KEYS) and a not in cand and not re.search(r'\.(pdf|jpg|png)$',a): cand.append(a)
    cand=[urllib.parse.urljoin(final,e) for e in extra]+cand
    for a in cand[:maxp]:
        pages.append((a,get(a)))
    seen=set()
    import itertools
    for u,h in pages:
        st=h[h.rfind('__STATUS'):]
        print('== PAGE',u,st[9:12])
        L=set()
        for x in re.findall(r'href=["\']([^"\']+)["\']',h):
            xl=x.lower()
            if ('linkedin.com' in xl or xl.startswith('mailto:') or xl.startswith('tel:')) and x not in seen: L.add(x); seen.add(x)
        for x in sorted(L): print('  L',x[:160])
        t=text(h)
        for e in sorted(set(re.findall(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+',t))):
            if e not in seen and not re.search(r'\.(png|jpg|webp|svg|gif)$',e): print('  E',e); seen.add(e)
        for ph in sorted(set(re.findall(r'(?:\+\d[\d ()./-]{7,18}\d|\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4})',t))):
            if ph not in seen: print('  P',ph); seen.add(ph)
        cnt=0
        for m in re.finditer(TITLES,t):
            cnt+=1
            if cnt>18: break
            s=t[max(0,m.start()-70):m.end()+50]
            k=s[50:110]
            if k in seen: continue
            seen.add(k); print('  T…',s)
if __name__=='__main__':
    n=int(os.environ.get('MAXP','8'))
    for d in sys.argv[1:]:
        try: crawl(d if d.startswith('http') else 'https://'+d,n)
        except Exception as e: print('ERR',d,e)
