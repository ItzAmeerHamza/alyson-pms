import json, glob, os
d = os.path.dirname(os.path.abspath(__file__))
recs = []
for f in sorted(glob.glob(os.path.join(d, 'c*.json'))):
    recs += json.load(open(f))
out = os.path.join(os.path.dirname(d), 'reval-theirstack-core-1.part1.json')
json.dump(recs, open(out, 'w'), indent=1, ensure_ascii=False)
print(len(recs), 'records ->', out)
