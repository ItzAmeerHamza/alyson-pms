import glob,os,importlib.util,sys
D=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,D)
import recs
for f in sorted(glob.glob(os.path.join(D,'r[0-9]*.py'))):
    spec=importlib.util.spec_from_file_location(os.path.basename(f)[:-3],f); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
recs.save()
