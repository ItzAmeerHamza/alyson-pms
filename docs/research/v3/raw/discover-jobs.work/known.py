import sys, os
D = os.path.dirname(os.path.abspath(__file__))
known = [l.strip() for l in open(os.path.join(D, '..', '..', 'known-companies.txt')) if l.strip()]
for n in sys.argv[1:]:
    hits = [k for k in known if n.lower() in k.lower()]
    print(f'{n}: {hits[:3]}')
