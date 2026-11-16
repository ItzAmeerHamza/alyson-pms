"""Print de-boilerplated text for pages matching a prefix. Lines that appear in >=40% of the
group's pages are dropped. Usage: python3 digest.py <prefix> [maxchars]"""
import sys, os, glob, collections
os.chdir(os.path.dirname(os.path.abspath(__file__)))
pre = sys.argv[1]
mx = int(sys.argv[2]) if len(sys.argv) > 2 else 6000
files = sorted(glob.glob('pages/' + pre + '*.txt'))
cnt = collections.Counter()
docs = {}
for f in files:
    lines = [l.strip() for l in open(f).read().split('\n')]
    docs[f] = lines
    for l in set(lines):
        cnt[l] += 1
thr = max(2, int(len(files) * 0.4)) if len(files) > 3 else 10**9
for f, lines in docs.items():
    out = []
    for l in lines:
        if not l or (cnt[l] >= thr and not l.startswith(('URL:', 'TITLE:', 'LD:'))):
            continue
        if l.startswith('META:') and 'og:' not in l and 'published' not in l and 'modified' not in l and 'description' not in l:
            continue
        out.append(l)
    txt = '\n'.join(out)
    print('#' * 8, f)
    print(txt[:mx])
