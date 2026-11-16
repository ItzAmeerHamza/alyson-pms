import subprocess, json, sys, time
# usage: ghl.py term lang1 lang2 ...  -> gh search code term --language X ; prints owner-type summary
SKIP = {"ever-works","mindcloud-inc","api-evangelist","NetsoftHoldings","mtxadmin","RooneyMcNibNug","PipedreamHQ","membranedev","oomol-lab","metorial","api-search","ShadowWhisperer","rix4uni","cirosantilli","airbytehq","keboola","LeoYeAI","dot-do","typerobot","rkendel1","Month2Month","LJAYi","Gizziio","nexts-sai","ever-co","writer","trycompai","homebrew","Homebrew"}
term = sys.argv[1]
seen = set()
for lang in sys.argv[2:]:
    for attempt in range(3):
        r = subprocess.run(["gh","search","code",term,"--language",lang,"--limit","100","--json","repository,path"],capture_output=True,text=True)
        if r.returncode == 0: break
        time.sleep(40)
    try:
        d = json.loads(r.stdout)
    except Exception:
        print("ERR", lang, r.stderr[:150]); continue
    for x in d:
        repo = x["repository"]["nameWithOwner"]
        if repo.split("/")[0] in SKIP or repo in seen: continue
        if "cask" in repo.lower() or "homebrew" in repo.lower(): continue
        seen.add(repo)
        print(lang, "|", repo, "|", x["path"])
    time.sleep(8)
