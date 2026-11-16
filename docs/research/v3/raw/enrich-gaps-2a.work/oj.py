"""Fetch onlinejobs.ph source postings for given batch indexes and print employer hints."""
import json, re, html, ssl, sys, urllib.request
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
d = json.load(open('/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3/batches/enrich-gaps-2a.json'))
for i in [int(x) for x in sys.argv[1].split(",")]:
    u = d[i]['source_url']
    try:
        t = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=25, context=ctx).read().decode('utf-8', 'replace')
    except Exception as e:
        print("==", i, u, "ERR", e); continue
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s)); s = re.sub(r"\s+", " ", s)
    urls = set(re.findall(r"(?:https?://)?(?:www\.)?[a-z0-9-]+\.(?:com|co|net|io|com\.au|co\.uk|de|it|org|shop|au|uk|ro)\b(?:/[^\s\"'<]*)?", s, re.I))
    urls = {x for x in urls if not re.search(r"onlinejobs|google|facebook|youtube|loom|calendly|canva|zoom", x, re.I)}
    hrefs = {h for h in re.findall(r'href="(https?://[^"]+)"', t) if not re.search(r"onlinejobs|google|facebook|twitter|instagram|youtube|apple\.com|play\.google|cloudflare", h)}
    print("==", i, d[i]['company_name'])
    print("   urls:", sorted(urls)[:15]); print("   hrefs:", sorted(hrefs)[:10])
    k = s.find(d[i]['company_name'].split()[0])
    print("   ctx:", s[max(0, k - 300):k + 700] if k >= 0 else "(name not found)")
    j = s.find("Job Description") if "Job Description" in s else s.find("JOB DESCRIPTION")
    if j > 0: print("   desc:", s[j:j + 1200])
