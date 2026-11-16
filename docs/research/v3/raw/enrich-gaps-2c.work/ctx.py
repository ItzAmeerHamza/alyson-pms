import sys,re
from f import get
from crawl import text
# usage: ctx.py URL pattern [pattern...]  -> text context; LI mapping printed with preceding & following text
u=sys.argv[1];h=get(u);t=text(h)
for p in sys.argv[2:]:
    if p=='LI':
        for m in re.finditer(r'linkedin\.com/in/[^"\'?]+',h):
            print('  LI',m.group(0),'| before:',text(h[max(0,m.start()-1200):m.start()])[-90:],'| after:',text(h[m.end():m.end()+600])[:70])
    else:
        for m in list(re.finditer(p,t,re.I))[:4]: print(' ',p,'::',t[max(0,m.start()-150):m.end()+200])
