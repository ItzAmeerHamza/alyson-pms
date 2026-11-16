"""Usage: python3 sm.py <name> <sitemap_url> [regex]
Recursively expands sitemap indexes, writes all URLs (lastmod url) to <name>.txt in this dir,
and prints those matching regex (default customer/case-study words)."""
import sys, re, subprocess, os, gzip
D = os.path.dirname(os.path.abspath(__file__))
def get(u):
    b = subprocess.run(["curl", "-sL", "-m", "40", "-A", "Mozilla/5.0 (Macintosh) Chrome/126", u], capture_output=True).stdout
    if b[:2] == b'\x1f\x8b':
        b = gzip.decompress(b)
    return b.decode('utf-8', 'ignore')
seen = set(); out = []
def walk(u, depth=0):
    if u in seen or depth > 3: return
    seen.add(u)
    x = get(u)
    if '<sitemapindex' in x:
        for l in re.findall(r'<loc>\s*(.*?)\s*</loc>', x):
            walk(l.replace('&amp;', '&'), depth + 1)
        return
    for blk in re.findall(r'<url>(.*?)</url>', x, re.S):
        l = re.search(r'<loc>\s*(.*?)\s*</loc>', blk); m = re.search(r'<lastmod>(.*?)</lastmod>', blk)
        if l: out.append(((m.group(1)[:10] if m else '----------'), l.group(1).strip()))
name, root = sys.argv[1], sys.argv[2]
rx = re.compile(sys.argv[3] if len(sys.argv) > 3 else r'customer|case-stud|casestud|success-stor|/stories/|testimonial|client', re.I)
walk(root)
open(os.path.join(D, name + '.txt'), 'w').write('\n'.join(f"{a} {b}" for a, b in out))
print("total", len(out), "sitemaps", len(seen))
for a, b in out:
    if rx.search(b): print(a, b)
