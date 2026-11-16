import subprocess, sys, json
for repo in sys.argv[1:]:
    r=subprocess.run(["gh","api","repos/"+repo],capture_output=True,text=True)
    try:
        d=json.loads(r.stdout)
        o=d["owner"]["login"]
        u=json.loads(subprocess.run(["gh","api","users/"+o],capture_output=True,text=True).stdout)
        print(repo,"|",d.get("description"),"| pushed",d.get("pushed_at"),"| owner",u.get("type"),u.get("name"),u.get("company"),u.get("blog"),u.get("location"))
    except Exception as e: print(repo,"ERR",r.stdout[:100])
