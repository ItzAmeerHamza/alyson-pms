import re, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
pat = {'dt.xml': r'/case-studies/', 'hs.xml': r'/customers/', 'ins.xml': r'insightful\.io/customers?/',
       'tc.xml': r'/case-studies/', 'we.xml': r'(case-stud|bpo-client|digital-transformation-case)',
       'ww.xml': r'/customers/'}
out = open('urls.tsv', 'w')
for f, p in pat.items():
    x = open(f).read()
    for m in re.finditer(r'<url>(.*?)</url>', x, re.S):
        b = m.group(1)
        loc = re.search(r'<loc>(.*?)</loc>', b).group(1).strip()
        if '/es/' in loc:
            continue
        if re.search(p, loc):
            lm = re.search(r'<lastmod>(.*?)</lastmod>', b)
            out.write(f"{f}\t{loc}\t{lm.group(1)[:10] if lm else ''}\n")
out.close()
