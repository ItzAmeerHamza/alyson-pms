"""Run cfmail.py on each URL arg, filtering noise."""
import subprocess, sys, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
NOISE = re.compile(r'@[0-9]|ads\.linkedin|sentry|wixpress|example|\.(js|css)$|@2x|@3x')
for u in sys.argv[1:]:
    print("==", u)
    out = subprocess.run([sys.executable, os.path.join(HERE, 'cfmail.py'), u], capture_output=True, text=True).stdout
    lines = [l for l in out.splitlines() if not NOISE.search(l)]
    print("\n".join(lines[:20]))
