import json, os, sys, re
D = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(D, 'oj_hits.json')))
for term in sys.argv[1:]:
    for x in d:
        t = x['overview'] + ' '.join(h['ctx'] for h in x['hits'])
        m = re.search(term, t, re.I)
        if m:
            print('==', term, x['date'], x['url'], [h['vendor'] for h in x['hits']])
            print('   ', t[max(0, m.start()-300):m.end()+300])
