"""Build ROOT/v3/raw/competitors.json. Edit VENDORS below; TheirStack counts are merged from scraped*.json."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'competitors.json')
CHECKED = '2026-10-05'
TS_NOTE = ('TheirStack public pages show only the top 10 companies per page/slice. Country slices '
           '(/en/technology/<slug>/<cc>) are real only when the page title says "in <Country> (n)"; an unsupported '
           'slice silently returns the GLOBAL top 10, so earlier per-country rows built from such URLs are duplicates '
           'with wrong country labels.')
G2_EM = 'https://www.g2.com/categories/employee-monitoring'
G2_TT = 'https://www.g2.com/categories/time-tracking'
CAP_EM = 'https://www.capterra.com/employee-monitoring-software/'
CAP_TT = 'https://www.capterra.com/time-tracking-software/'
CAP_TC = 'https://www.capterra.com/time-clock-software/'
G2_WA = 'https://www.g2.com/categories/workforce-analytics'

# fields: vendor, domain, category, in_brief, discovered_via, pricing_summary, pricing_url,
#         price_per_seat, price_plan_used, theirstack_slug, customer_story_url, notes
from vendors_data import VENDORS


def ts_counts():
    p = os.path.join(HERE, 'scraped2.json')
    if not os.path.exists(p):
        p = os.path.join(HERE, 'scraped.json')
    return json.load(open(p)) if os.path.exists(p) else {}


def main():
    ts = ts_counts()
    out = []
    for v in VENDORS:
        r = dict(v)
        slug = r.get('theirstack_slug', '')
        rec = ts.get(slug, {}) if slug else {}
        r['theirstack_company_count'] = int(rec['count']) if rec.get('count') else (0 if slug else None)
        r['theirstack_count_url'] = ('https://theirstack.com/en/technology/' + slug) if slug else ''
        if slug and rec.get('slices'):
            r['theirstack_real_slices'] = {k: s.get('count') or '' for k, s in rec['slices'].items() if k != 'global'}
        r['pricing_checked_date'] = CHECKED
        if not slug:
            r['notes'] = (r.get('notes', '') + ' TheirStack: no technology page found (checked slug guesses + all 5 technology sitemaps).').strip()
        r['theirstack_note'] = TS_NOTE
        out.append(r)
    keys = ['vendor', 'domain', 'category', 'in_brief', 'discovered_via', 'pricing_summary', 'pricing_url',
            'pricing_checked_date', 'price_per_seat', 'price_plan_used', 'theirstack_slug', 'theirstack_company_count',
            'theirstack_count_url', 'theirstack_real_slices', 'customer_story_url', 'notes', 'theirstack_note']
    out = [{k: r.get(k, '') for k in keys} for r in out]
    json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
    print('wrote', len(out), OUT)


if __name__ == '__main__':
    main()
