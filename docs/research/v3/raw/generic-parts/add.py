import json,sys
recs=json.load(sys.stdin)
with open('validated.jsonl','a') as f:
    for r in recs: f.write(json.dumps(r,ensure_ascii=False)+'\n')
print('added',len(recs),'total',sum(1 for _ in open('validated.jsonl')))
