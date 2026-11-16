import json,os
D=os.path.dirname(os.path.abspath(__file__))
B=json.load(open(os.path.join(D,'../../batches/enrich-gaps-2c.json')))
BY={r['company_name']:r for r in B}
R={}
def rec(name,domain=None,contacts=(),li=None,phone=None,email=None,csrc=None,notes='',status='',reason='',emp=None,hq=None):
    b=BY[name]
    r={"company_name":name,"company_domain":domain if domain is not None else b['company_domain'],"vendor":b['competitor_vendor'],
       "evidence_type":"Contact enrichment","status":status,"confidence_score":0,
       "employee_count":emp if emp is not None else b['employee_count'],"hq_country":hq or b['HQ_country'],
       "contacts":[dict(name=c[0],title=c[1],linkedin=c[2],source_url=c[3]) for c in contacts],
       "company_linkedin":li if li is not None else b['company_linkedin'],"company_phone":phone if phone is not None else b['company_phone'],
       "public_email":email if email is not None else b['public_email'],"contact_source_url":csrc if csrc is not None else b['contact_source_url'],"notes":notes}
    if status: r['status_reason']=reason
    R[name]=r
def save():
    out=[R[b['company_name']] for b in B if b['company_name'] in R]
    p=os.path.join(D,'../enrich-gaps-2c.json')
    json.dump(out,open(p,'w'),indent=1,ensure_ascii=False)
    done=[b['company_name'] for b in B if b['company_name'] in R]; left=[b['company_name'] for b in B if b['company_name'] not in R]
    open(p.replace('.json','.progress.md'),'w').write(f"# enrich-gaps-2c progress\n\nMethod: company sites (curl, browser UA), vendor case-study pages, Swiss Zefix registry. No WebSearch (budget exhausted).\nRecord scripts: enrich-gaps-2c.work/r*.py (run all.py to rebuild).\n\nDone ({len(done)}): {', '.join(done)}\n\nLeft ({len(left)}): {', '.join(left)}\n")
    print('saved',len(out))
