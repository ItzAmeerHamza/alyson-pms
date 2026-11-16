import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(HERE, 'validated.json')
v = json.load(open(p))
n = "Validation search 2026-10-05 found no public confirmation of use."
for k in ["TEAM LEWIS|ClickTime", "LEWIS|ClickTime", "Inviqa|Harvest Forecast", "Armadillo|Harvest Forecast",
          "Transpire Technology Pty Ltd|Harvest Forecast", "FifthColor|Paymo", "Launchpad Technologies Inc.|Connecteam",
          "Endo Networks Inc.|Connecteam"]:
    v[k] = {"notes": n}
v["Transpire Technology Pty Ltd|Harvest Forecast"]["notes"] += " Transpire was acquired by CI&T in 2022 (ciandt.com press release)."
v["Grapefruit|Connecteam"] = {"notes": "Not validated: generic name and no domain."}
v["Align|busybusy"] = {"notes": "Not validated: Align (align.com) is an IT services firm, but busybusy is construction-focused, so a name/tech collision is likely."}
json.dump(v, open(p, 'w'), indent=1, ensure_ascii=False)
print(len(v))
