import json,sys
# usage: python3 add.py < records (one JSON object per line); appends/replaces by company_name
p='decisions.jsonl.txt'
cur={}
for l in open(p):
    l=l.strip()
    if l: d=json.loads(l); cur[d['company_name']]=d
for l in sys.stdin:
    l=l.strip()
    if l: d=json.loads(l); cur[d['company_name']]=d
with open(p,'w') as f:
    for d in cur.values(): f.write(json.dumps(d,ensure_ascii=False)+'\n')
print(len(cur),'decisions')
