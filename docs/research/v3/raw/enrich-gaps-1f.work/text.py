import sys, re, html, urllib.request, ssl
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
url = sys.argv[1]
kw = sys.argv[2:] or ['contact']
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"})
t = urllib.request.urlopen(req, timeout=20, context=ctx).read().decode('utf-8', 'ignore')
t = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', t, flags=re.S)
t = re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', t)))
for k in kw:
    for m in list(re.finditer(re.escape(k), t, re.I))[:4]:
        print('..', t[max(0, m.start()-250):m.start()+350])
        print()
