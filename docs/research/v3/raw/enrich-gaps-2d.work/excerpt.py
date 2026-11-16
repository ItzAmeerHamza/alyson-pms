import glob, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
keys = {'nylon': 'Nylon', 'oim': 'OIM', 'rebuilding': 'Rebuilding', 'shook': 'Shook',
        'children': 'Advocacy', 'control': 'Control Gap'}
for f in sorted(glob.glob('cs_*.txt')):
    t = open(f).read()
    k = next(v for kk, v in keys.items() if kk in f)
    idx = [i for i in range(len(t)) if t.startswith(k, i)]
    print('===', f, len(t), len(idx))
    # print from the 2nd occurrence (body) for 2500 chars
    start = idx[1] if len(idx) > 1 else (idx[0] if idx else 0)
    print(t[max(0, start - 300):start + 2500])
