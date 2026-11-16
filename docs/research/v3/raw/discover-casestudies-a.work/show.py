"""show.py <glob> [regex] [maxlines]  - print lines of pages/<glob> matching regex (case-insens)."""
import sys, os, glob, re
os.chdir(os.path.dirname(os.path.abspath(__file__)))
g = sys.argv[1]
rx = re.compile(sys.argv[2], re.I) if len(sys.argv) > 2 and sys.argv[2] else None
mx = int(sys.argv[3]) if len(sys.argv) > 3 else 40
for f in sorted(glob.glob('pages/' + g)):
    print('##', f)
    n = 0
    for l in open(f):
        l = l.strip()
        if not l:
            continue
        if l.startswith(('URL:', 'TITLE:', 'LD:')) or (rx and rx.search(l)) or (not rx):
            print(l[:400])
            n += 1
            if n >= mx:
                break
