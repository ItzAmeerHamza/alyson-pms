import sys,re,subprocess,html,urllib.parse
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
def get(u):
    r=subprocess.run(["curl","-sL","-m","25","-A",UA,"-H","Accept-Language: en-US,en;q=0.9",u,"-w","\n__STATUS %{http_code} %{url_effective}"],capture_output=True)
    return r.stdout.decode("utf-8","replace")
if __name__!="__main__": pass
else:
  mode=sys.argv[1]
  for u in sys.argv[2:]:
      h=get(u)
      st=h[h.rfind("__STATUS"):]
      print("=====",u,st)
      if mode in("l","a"):
          hrefs=set(re.findall(r'href=["\']([^"\']+)["\']',h))
          for x in sorted(hrefs):
              xl=x.lower()
              if any(k in xl for k in["linkedin","mailto:","tel:"]) or (mode=="a" and x.startswith("http") and not any(k in xl for k in["facebook","twitter","instagram","youtube","google","wp-","cdn","fonts",".css",".js",".png",".jpg","schema.org","w3.org"])):
                  print("  L",x[:200])
          for e in sorted(set(re.findall(r'[\w.+-]+@[\w-]+\.[\w.-]+',h))):
              if not re.search(r'\.(png|jpg|webp|svg|gif)$',e) and 'sentry' not in e and 'wixpress' not in e: print("  E",e)
      if mode in("t","a"):
          t=re.sub(r'(?is)<(script|style|noscript|svg).*?</\1>',' ',h)
          t=re.sub(r'<[^>]+>',' ',t);t=html.unescape(t);t=re.sub(r'\s+',' ',t)
          n=int(__import__('os').environ.get('N','3000'))
          print("  T",t[:n])
