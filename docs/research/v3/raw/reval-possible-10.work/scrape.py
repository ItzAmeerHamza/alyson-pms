import sys,re,html,subprocess
for u in sys.argv[1:]:
    s=subprocess.run(['curl','-sL','-m','20','-A','Mozilla/5.0 (Macintosh) Chrome/120',u],capture_output=True,text=True,errors='ignore').stdout
    t=re.sub(r'<script.*?</script>|<style.*?</style>',' ',s,flags=re.S);t=re.sub(r'<[^>]+>',' ',t);t=re.sub(r'\s+',' ',html.unescape(t))
    print('==',u,len(s));print(t[:int(sys.argv[0:1] and 1200)])
    print('EMAILS',set(e for e in re.findall(r'[\w.+-]+@[\w-]+\.[\w.]+',s) if not e.endswith(('.png','.jpg','.webp','.svg'))))
    print('PHONES',set(re.findall(r'\+?\(?\d[\d ()./-]{8,}\d',t))[:0] if False else list(set(re.findall(r'(?:\+|tel:?\s?)?\(?\d{2,4}\)?[ .-]\d{2,4}[ .-]\d{2,4}(?:[ .-]\d{2,4})?',t)))[:10])
    print('LI',set(re.findall(r'linkedin\.com/(?:company|in)/[\w%-]+',s)))
    for kw in ['time track','timesheet','Toggl','Everhour','TimeClick','Hubstaff','Time Doctor','Jibble','Replicon','CEO','Founder','Managing Director','Director']:
        for m in re.finditer(re.escape(kw),t,flags=re.I):
            print('  KW',kw,'::',t[max(0,m.start()-100):m.end()+100]);break
