"""Parse FeaturedCustomers JSON-LD reviews for each vendor slug -> fc_<slug>.tsv"""
import os, re, json, subprocess, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/124 Safari/537.36'
slugs = sys.argv[1:] or ['hubstaff', 'time-doctor', 'insightful', 'desktime', 'time-champ', 'webwork-time-tracker', 'we360-ai']
rx = re.compile(r'"reviewBody":\s*"((?:[^"\\]|\\.)*)".*?"author":\s*\{[^}]*"name":\s*"([^"]*)"(?:,\s*"jobTitle":\s*"([^"]*)")?[^}]*\}(?:,\s*"publisher":\s*\{[^}]*"name":\s*"([^"]*)")?', re.S)
for s in slugs:
    seen = {}
    for kind in ['testimonials', 'case-studies']:
        for page in range(1, 8):
            u = f'https://www.featuredcustomers.com/vendor/{s}/{kind}' + (f'?page={page}' if page > 1 else '')
            raw = subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, u], capture_output=True).stdout.decode('utf-8', 'ignore')
            new = 0
            for m in rx.finditer(raw):
                body, name, title, org = m.groups()
                key = (name, org)
                if key not in seen:
                    seen[key] = (kind, title or '', body[:300].replace('\t', ' ').replace('\n', ' '))
                    new += 1
            # case study titles
            for m in re.finditer(r'href="(https://www\.featuredcustomers\.com/vendor/%s/case-studies/[^"]+)"' % re.escape(s), raw):
                k = ('CASESTUDY', m.group(1))
                if k not in seen:
                    seen[k] = ('case-link', '', '')
                    new += 1
            if new == 0:
                break
    with open(f'fc_{s}.tsv', 'w') as f:
        for (name, org), (kind, title, body) in seen.items():
            f.write(f'{kind}\t{org}\t{name}\t{title}\t{body}\n')
    print(s, len(seen))
