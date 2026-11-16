"""Companies House: search a name, or list officers for a company number.
usage: python3 ch.py search "name"  |  python3 ch.py officers 12345678"""
import sys, re, html, urllib.request, urllib.parse
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
B = "https://find-and-update.company-information.service.gov.uk"
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=25).read().decode("utf-8", "replace")
def text(t):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s)))
if sys.argv[1] == "search":
    t = get(B + "/search/companies?q=" + urllib.parse.quote(sys.argv[2]))
    for m in re.finditer(r'<li class="type-company">(.*?)</li>', t, re.S):
        print("-", text(m.group(1))[:220])
else:
    s = text(get(B + "/company/%s/officers" % sys.argv[2]))
    i = s.find("officers:")
    print(s[i:i + 1800] if i >= 0 else s[:1800])
