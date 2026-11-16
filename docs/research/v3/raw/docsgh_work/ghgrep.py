import subprocess, sys, base64, re, json
# usage: ghgrep.py owner/repo pattern path1 [path2...]   (path "README" -> readme)
repo, pat = sys.argv[1], sys.argv[2]
for p in sys.argv[3:]:
    ep = f"repos/{repo}/readme" if p=="README" else f"repos/{repo}/contents/{p}"
    r = subprocess.run(["gh","api",ep],capture_output=True,text=True)
    print("==",repo,p)
    try:
        txt = base64.b64decode(json.loads(r.stdout)["content"]).decode("utf-8","replace")
    except Exception as e:
        print("ERR", r.stdout[:200], r.stderr[:200]); continue
    lines = txt.splitlines()
    if pat == "*":
        print("\n".join(lines[:60])); continue
    for i,l in enumerate(lines):
        if re.search(pat,l,re.I):
            print(f"{i}:", " | ".join(lines[max(0,i-1):i+2])[:400])
