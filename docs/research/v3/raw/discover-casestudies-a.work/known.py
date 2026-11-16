"""known.py name1 name2 ... -> which are in known-companies.txt (normalized + substring)."""
import sys, os, re
os.chdir(os.path.dirname(os.path.abspath(__file__)))
def norm(s):
    s = s.lower()
    s = re.sub(r'\b(inc|llc|ltd|limited|pvt|private|corp|corporation|co|gmbh|group|the|solutions|technologies|services)\b', ' ', s)
    return re.sub(r'[^a-z0-9]', '', s)
K = [l.strip() for l in open('../../known-companies.txt') if l.strip()]
KN = [(norm(k), k) for k in K]
for a in sys.argv[1:]:
    n = norm(a)
    exact = [k for nk, k in KN if nk == n]
    sub = [k for nk, k in KN if len(n) > 4 and nk != n and (n in nk or (len(nk) > 4 and nk in n))]
    print(f'{a}: EXACT={exact} SUB={sub[:5]}')
