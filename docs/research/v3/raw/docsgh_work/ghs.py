import subprocess, json, sys, time
for q in sys.argv[1:]:
    for attempt in range(3):
        r = subprocess.run(["gh","search","code",q,"--limit","50","--json","repository,path"],capture_output=True,text=True)
        if r.returncode==0: break
        time.sleep(30)
    print("===",q)
    try:
        d=json.loads(r.stdout)
        seen=set()
        for x in d:
            k=(x['repository']['nameWithOwner'],x['path'])
            if k in seen: continue
            seen.add(k); print("  ",*k)
    except Exception as e: print("ERR",r.stderr[:200])
    time.sleep(7)
