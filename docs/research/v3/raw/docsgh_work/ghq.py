import subprocess, json, sys, time, urllib.parse
# raw GitHub code search API: each arg is a full query string, e.g. 'hubstaff path:handbook'
for q in sys.argv[1:]:
    ep = "search/code?per_page=50&q=" + urllib.parse.quote(q)
    for attempt in range(3):
        r = subprocess.run(["gh", "api", ep], capture_output=True, text=True)
        if r.returncode == 0:
            break
        time.sleep(30)
    print("===", q)
    try:
        d = json.loads(r.stdout)
        print("  total", d.get("total_count"))
        for x in d.get("items", []):
            print("  ", x["repository"]["full_name"], x["path"])
    except Exception:
        print("ERR", r.stderr[:200])
    time.sleep(7)
