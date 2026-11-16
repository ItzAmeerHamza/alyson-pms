"""Probe every country / zone slice for each relevant TheirStack technology.
A slice is REAL only when its <title> says 'in <place>'; unsupported slices silently
return the global top-10 page (title without 'in')."""
import ts, json, os, sys
from concurrent.futures import ThreadPoolExecutor
from scrape import SLUGS
HERE = os.path.dirname(os.path.abspath(__file__))
CC = ('us gb ca au nz ie in pk ph bd lk np id my sg th vn jp kr cn hk tw ae sa qa kw bh om il tr eg ma ng ke za gh '
      'de at ch fr be nl lu es pt it gr pl cz sk hu ro bg hr si rs ua ee lv lt fi se no dk is mt cy '
      'mx br ar cl co pe uy ec cr pa gt do pr ve bo py').split()
ZONES = ('amer aukus north-america canzuk anzuk emea europe eea eu apac asia asean asean+5 asean+6 latam '
         'south-america central-america africa oceania middle-east mena gcc nordics dach benelux bric b-brics basic imea '
         'g7 g20 oecd five-eyes cee balkans caribbean').split()
data = json.load(open(os.path.join(HERE, 'scraped.json')))


def probe(args):
    slug, sl = args
    url = 'https://theirstack.com/en/technology/%s/%s' % (slug, sl)
    h, c = ts.fetch(url, sleep=0.2)
    t = ts.title(h)
    real = c == 200 and ' in ' in t
    return slug, sl, url, real, t, (ts.parse(h) if real else [])


jobs = []
for slug, rec in data.items():
    if not rec.get('count') or int(rec['count']) <= 10:
        continue
    for sl in CC + ZONES:
        if sl not in rec['slices']:
            jobs.append((slug, sl))
print('jobs', len(jobs)); sys.stdout.flush()
with ThreadPoolExecutor(6) as ex:
    for i, (slug, sl, url, real, t, rows) in enumerate(ex.map(probe, jobs)):
        rec = data[slug]
        if real:
            rec['slices'][sl] = {'url': url, 'title': t, 'count': ts.count_from_title(t) if hasattr(ts, 'count_from_title') else ''}
            for r in rows:
                k = r['name'].lower(); cells = r['cells'] + [''] * 6
                if k not in rec['companies']:
                    rec['companies'][k] = {'name': r['name'], 'domain': r['domain'], 'country': cells[1],
                                           'industry': cells[2], 'employees': cells[3], 'revenue': cells[4],
                                           'techs': cells[5], 'urls': []}
                rec['companies'][k]['urls'].append(url)
        if i % 200 == 0:
            print(i, slug, sl); sys.stdout.flush()
            json.dump(data, open(os.path.join(HERE, 'scraped2.json'), 'w'), indent=1)
json.dump(data, open(os.path.join(HERE, 'scraped2.json'), 'w'), indent=1)
for slug, rec in data.items():
    print(slug, rec.get('count'), len(rec.get('slices', {})), len(rec.get('companies', {})))
