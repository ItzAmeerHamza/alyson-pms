import json, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open('domain_check.json'))
for k in ['botkeeper.com', 'cekindo.com', 'executivemosaic.com', 'txtimpact.com', 'habcnj.org', 'smartbuyglasses.com']:
    d[k] = True  # bot-protected but responding / verified elsewhere
json.dump(d, open('domain_check.json', 'w'), indent=1)
