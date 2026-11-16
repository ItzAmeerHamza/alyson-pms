"""Render pages through r.jina.ai and print lines with contact signals (emails, phones, LinkedIn, exec titles)."""
import re, sys, subprocess
PAT = re.compile(r'@|tel:|linkedin\.com/(in|company)|\+\d|\(\d{3}\)|\b(CEO|COO|CTO|CFO|Founder|Co-Founder|Director|President|Managing|Head of|Chief|Owner|Partner|Manager)\b', re.I)
for url in sys.argv[1:]:
    print("=====", url)
    try:
        out = subprocess.run(["curl", "-s", "-m", "45", "https://r.jina.ai/" + url], capture_output=True, text=True, timeout=60).stdout
    except Exception as ex:
        print("ERR", ex); continue
    seen = set()
    for line in out.splitlines():
        line = line.strip()
        if not line or line in seen or 'ads.linkedin' in line:
            continue
        if PAT.search(line):
            seen.add(line)
            # trim image markdown noise
            line = re.sub(r'!\[Image[^\]]*\]\([^)]*\)', '', line)
            print(line[:400])
