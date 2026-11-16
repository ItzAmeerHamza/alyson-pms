import sys as _s
ARGS=[l.strip() for a in _s.argv[1:] for l in (open(a[1:]).read().split() if a.startswith('@') else [a]) if l.strip()]
"""Usage: python3 links.py url [url...] — print external outbound links (minus vendor/social noise) per page."""
import sys, re, subprocess, os
from concurrent.futures import ThreadPoolExecutor
NOISE = re.compile(os.environ.get('NOISE', 'zzqq') + r'|clockify|cake\.com|pumble|plaky|apple\.com|google|microsoft|mozilla|facebook|twitter|youtube|instagram|capterra|g2\.com|getapp|softwareadvice|trustradius|crozdesk|sourceforge|x\.com|tiktok|wordpress|w3\.org|schema\.org|gstatic|cloudflare|hubspot|vimeo|wistia|cookie|onetrust', re.I)
def get(u):
    return subprocess.run(["curl", "-sL", "-m", "25", "-A", "Mozilla/5.0", u], capture_output=True).stdout.decode('utf-8', 'ignore')
def run(u):
    h = get(u)
    ls = sorted(set(l for l in re.findall(r'href="(https?://[^"#]+)"', h) if not NOISE.search(l)))
    return u, ls
for u, ls in ThreadPoolExecutor(8).map(run, ARGS):
    print(u.rsplit('/', 1)[-1] or u, '->', ' '.join(ls[:8]))
