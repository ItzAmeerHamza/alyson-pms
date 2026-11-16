"""Usage: python3 cdx.py url|@file ... — earliest Wayback capture date per URL (proxy for story publish date)."""
import sys, subprocess, json
from concurrent.futures import ThreadPoolExecutor
ARGS = [l.strip() for a in sys.argv[1:] for l in (open(a[1:]).read().split() if a.startswith('@') else [a]) if l.strip()]
def first(u):
    q = "https://web.archive.org/cdx/search/cdx?url=" + u.split('://', 1)[-1].rstrip('/') + "&output=json&limit=1&fl=timestamp&filter=statuscode:200"
    r = subprocess.run(["curl", "-s", "-m", "30", q], capture_output=True).stdout.decode('utf-8', 'ignore')
    try:
        j = json.loads(r); t = j[1][0]; return u, f"{t[:4]}-{t[4:6]}-{t[6:8]}"
    except Exception:
        return u, "?"
for u, d in ThreadPoolExecutor(6).map(first, ARGS):
    print(d, u)
