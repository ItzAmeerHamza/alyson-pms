import json,re,html,subprocess,urllib.parse
from f import get
d=json.load(open('../../batches/enrich-gaps-2c.json'))
out=[]
for i,r in enumerate(d):
    u=r['source_url'];h=get(u)
    vend=urllib.parse.urlparse(u).netloc.replace('www.','')
    links=sorted(set(x for x in re.findall(r'href=["\'](https?://[^"\']+)["\']',h) if vend.split('.')[0] not in x and not any(k in x.lower() for k in ['facebook','twitter','instagram','youtube','google','apple.com','capterra','g2.com','x.com','cdn','wp-content','fonts','schema','w3.org','hubspot','trustpilot','tiktok','pinterest','getapp','softwareadvice','vimeo','wistia','cloudflare','gstatic','typeform','onetrust','cookie','deltek','beebole','clicktime','paymo','timely','timeero','currentware','flowace','myhours'])))
    t=re.sub(r'(?is)<(script|style|noscript|svg).*?</\1>',' ',h);t=re.sub(r'<[^>]+>',' ',t);t=html.unescape(t);t=re.sub(r'\s+',' ',t)
    out.append(f"##### {i} {r['company_name']} {u} {h[h.rfind('__STATUS'):]}\nLINKS: {links[:40]}\n")
open('cs_out.txt','w').write('\n'.join(out))
