import subprocess, os, sys
D = os.path.dirname(os.path.abspath(__file__))
V = [("timeero", "https://timeero.com/sitemap.xml"), ("timely", "https://timelyapp.com/sitemap.xml"), ("timeular", "https://timeular.com/sitemap.xml"),
     ("myhours", "https://myhours.com/sitemap.xml"), ("paymo", "https://www.paymoapp.com/sitemap.xml"), ("clicktime", "https://www.clicktime.com/sitemap.xml"),
     ("beebole", "https://beebole.com/sitemap.xml"), ("rescuetime", "https://www.rescuetime.com/sitemap.xml"), ("timesheetscom", "https://www.timesheets.com/sitemap.xml"),
     ("timeanalytics", "https://www.timeanalyticssoftware.com/sitemap.xml"), ("qbtime", "https://quickbooks.intuit.com/sitemap.xml")]
sel = sys.argv[1:] or [n for n, _ in V]
RX = r'customer|case-stud|casestud|success-stor|/stories/|testimon'
import re
loc = re.compile(r'/(de|fr|es|pt|it|nl|ja|ko|pl|tr|ru|zh|sv|da|fi|no|br|pt-br|es-es|fr-fr|de-de)/')
for n, u in V:
    if n not in sel: continue
    out = subprocess.run(["python3", os.path.join(D, "sm.py"), n, u, RX], capture_output=True, text=True).stdout.splitlines()
    print("####", n, out[0] if out else "")
    lines = [l for l in out[1:] if not loc.search(l)]
    for l in lines[:45]: print("  ", l)
    if len(lines) > 45: print("   ... +", len(lines) - 45)
