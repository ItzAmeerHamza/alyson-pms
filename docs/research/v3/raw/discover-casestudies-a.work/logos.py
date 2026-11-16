"""logos.py url...  -> print customer-logo-like image names / alt texts per page."""
import sys, re, subprocess, html, os
UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/124 Safari/537.36'
SKIP = re.compile(r'(icon|arrow|badge|g2|capterra|getapp|award|flag|avatar|screenshot|hero|feature|bg|background|illustration|check|star|play|menu|footer|header|og-|favicon|apple|google-play|chrome|windows|mac|linux|android|ios|soc|iso|gdpr|hipaa|ccpa|integrat|slack|jira|asana|trello|zapier|clickup|salesforce|hubspot|github|gitlab|outlook|calendar|teams|zoom)', re.I)
for u in sys.argv[1:]:
    raw = subprocess.run(['curl', '-sL', '-m', '30', '-A', UA, u], capture_output=True).stdout.decode('utf-8', 'ignore')
    names = set()
    for m in re.finditer(r'<img[^>]+>', raw, re.I):
        tag = m.group(0)
        src = re.search(r'(?:src|data-src)="([^"]+)"', tag)
        alt = re.search(r'alt="([^"]*)"', tag)
        s = src.group(1) if src else ''
        a = html.unescape(alt.group(1)) if alt else ''
        fn = os.path.basename(s.split('?')[0])
        if re.search(r'logo|client|customer|brand|partner|trusted', s + ' ' + a, re.I) and not SKIP.search(fn + ' ' + a):
            names.add((a.strip()[:60], fn[:80]))
    print('=====', u, len(names))
    for a, fn in sorted(names):
        print('  ', a, '|', fn)
