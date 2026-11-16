import json, re, os
D = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(D, 'oj_hits.json')))
d = [x for x in d if x['hits'] and re.search(r'202[56]', x['date'])]
pat = re.compile(r"(\b(?:At|Join|About) ([A-Z][\w&'.-]+(?: [A-Z][\w&'.-]+){0,3})|([A-Z][\w&'.-]+(?: [A-Z][\w&'.-]+){0,3}),? (?:Inc|LLC|Ltd|LTD|Pty|PLLC|P\.?C\.|Corp|Group|Agency|Company|Co\.|Clinic|Law|Realty|Solutions|Consulting|Media|Marketing)\b|([A-Z][\w&'.-]+(?: [A-Z][\w&'.-]+){0,3}) (?:is a|is an) )")
rows = []
for x in d:
    ms = [m.group(0) for m in pat.finditer(x['overview'])]
    ms = [m for m in ms if not re.match(r'(About|Join) (Us|the|Our|our|The|This|Me|You|a|an)\b', m)]
    if ms: rows.append(x)
keep = [7,10,13,17,19,23,25,28,31,33,47,52,55,56,59,63,68,78,86,89,91,94,113,115,120,131,132,143,147,148,149,150,157,158,175,179,180,181,185,187,195,198,201,202,207,216,219,229,230,232,233,234,235,237,238,239,242,244,245,247,249,251,257,258,259]
out = []
for i in keep:
    x = rows[i]
    out.append({'i': i, 'url': x['url'], 'date': x['date'], 'type': x['type'], 'title': x['title'], 'overview': x['overview'][:500],
                'hits': [{'v': h['vendor'], 'ctx': h['ctx'][100:330]} for h in x['hits']]})
json.dump(out, open(os.path.join(D, 'oj_sel.json'), 'w'), indent=1, ensure_ascii=False)
for o in out:
    print(f"#{o['i']} {o['date']} {o['url'].split('/job/')[1][:60]}\n  OV: {o['overview'][:280]}\n  " + ' || '.join(f"[{h['v']}] {h['ctx']}" for h in o['hits']))
