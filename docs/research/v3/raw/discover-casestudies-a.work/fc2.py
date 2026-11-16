"""FeaturedCustomers: list customer logos (alt) + any unblurred testimonial contact per vendor."""
import os, re, subprocess, html
os.chdir(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/124 Safari/537.36'
for s in ['time-doctor', 'insightful', 'desktime', 'time-champ', 'webwork-time-tracker', 'we360-ai', 'hubstaff']:
    names = {}
    for kind in ['', '/testimonials', '/case-studies']:
        u = f'https://www.featuredcustomers.com/vendor/{s}{kind}'
        raw = subprocess.run(['curl', '-sL', '-m', '40', '-A', UA, u], capture_output=True).stdout.decode('utf-8', 'ignore')
        for m in re.finditer(r'Company\.logo_[a-z]+/([a-z0-9-]+)_\d+\.\w+"\s+alt="([^"]*)"', raw):
            names.setdefault(html.unescape(m.group(2)) or m.group(1), set()).add(kind or '/profile')
        for m in re.finditer(r'data-body="([^"]*)"\s*data-contact-name="([^"]*)"\s*data-contact-title="([^"]*)"', raw):
            print(s, 'TESTI', html.unescape(m.group(2)), '|', html.unescape(m.group(3)), '|', html.unescape(m.group(1))[:200])
        for m in re.finditer(r'href="(/vendor/%s/case-studies/[^"]+)"[^>]*>([^<]*)' % re.escape(s), raw):
            print(s, 'CASE', m.group(1), html.unescape(m.group(2)).strip()[:100])
    print(s, 'LOGOS', sorted(names))
