import json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(HERE, 'findings.json')
F = json.load(open(p))
new = json.load(open(os.path.join(HERE, sys.argv[1])))
F.update(new)
json.dump(F, open(p, 'w'), indent=1, ensure_ascii=False)
print('findings:', len(F))
