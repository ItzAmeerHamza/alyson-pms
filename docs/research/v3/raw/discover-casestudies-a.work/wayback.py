"""First Wayback capture per story URL, for a list of prefixes. Writes wayback.tsv (url, first_ts)."""
import os, subprocess, re
os.chdir(os.path.dirname(os.path.abspath(__file__)))
prefixes = ['hubstaff.com/customers/', 'hubstaff.com/tasks/customers/', 'insightful.io/customers/',
            'insightful.io/customer/', 'desktime.com/case-studies/', 'desktime.com/blog/', 'timechamp.io/case-studies/',
            'we360.ai/case-studies/', 'webwork-tracker.com/customers/', 'resources.timedoctor.com/case-stud',
            'timedoctor.com/case-stud', 'timedoctor.com/customers', 'biz30.timedoctor.com/case', 'timedoctor.com/blog/case']
first = {}
for p in prefixes:
    u = f'http://web.archive.org/cdx/search/cdx?url={p}&matchType=prefix&fl=original,timestamp&limit=20000&filter=statuscode:200'
    out = subprocess.run(['curl', '-s', '-m', '120', u], capture_output=True).stdout.decode('utf-8', 'ignore')
    for line in out.splitlines():
        parts = line.split(' ')
        if len(parts) != 2:
            continue
        url, ts = parts
        url = re.sub(r'[?#].*', '', url).replace('http://', 'https://').replace('://www.', '://').rstrip('/')
        url = re.sub(r':80(/|$)', r'\1', url)
        if re.search(r'\.(css|js|png|jpe?g|svg|webp|gif|pdf)$', url, re.I):
            continue
        if url not in first or ts < first[url][0]:
            first[url] = (ts, first.get(url, (ts, ts))[1])
        if ts > first[url][1]:
            first[url] = (first[url][0], ts)
with open('wayback.tsv', 'w') as f:
    for k in sorted(first):
        a, b = first[k]
        f.write(f'{k}\t{a[:8]}\t{b[:8]}\n')
print(len(first))
