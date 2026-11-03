"""Create a small source-only ZIP for approved-scenario polishing integration."""
import argparse,hashlib,json,pathlib,zipfile
REQUIRED=['src/application/assignment-evidence-library.js','src/infrastructure/applications/sqlite-assignment-evidence.js','src/interfaces/http/assignment-evidence-http.js','src/interfaces/http/assignment-evidence-client.js','src/interfaces/http/create-local-server.js','src/interfaces/http/rendering.js','src/interfaces/http/polishing-cost-controls.js','src/application/refine-cover-letter.js','src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js']
OPTIONAL=['package.json','src/interfaces/http/run-local-server.js','src/interfaces/http/application-review-controls.js','src/interfaces/http/application-review-http.js','src/interfaces/http/review-page.js','src/application/save-application-review.js','src/application/durable-review-store.js','src/application/selected-cv-evidence-loader.js','src/application/achievement-evidence.js','src/application/cover-letter-controls.js','src/application/senior-cover-letter-instructions.js','src/application/cover-letter-budget.js','src/interfaces/http/responses.js','src/interfaces/http/form-body.js','src/interfaces/http/review-workspace.js','src/config/deployment-runtime.js','tests/application/assignment-evidence-library.test.js','tests/application/personal-polishing-instructions.test.mjs','tests/application/urgent-review-ui.test.js','tests/application/polishing-cost-first.test.js','tests/application/refinement-evidence-contract.test.js','tests/application/problem-solver-source-commentary.test.js','tests/application/refine-cover-letter.test.js','tests/interfaces/http/create-local-server.test.js','tests/ui/assignment-evidence-library.spec.js']
def main():
 p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out',default='docs/scenario-polishing-source.zip');a=p.parse_args();source=pathlib.Path(a.source);destination=pathlib.Path(a.out)
 if destination.exists():raise SystemExit('Output already exists. Rename it explicitly; nothing overwritten.')
 data=json.loads(source.read_text(encoding='utf-8-sig'));files={x['path']:x for x in data.get('files',[]) if isinstance(x,dict) and isinstance(x.get('path'),str)};missing=[n for n in REQUIRED if n not in files]
 if missing:raise SystemExit('Required source missing from capture: '+', '.join(missing))
 selected=[]
 for name in REQUIRED+OPTIONAL:
  if name not in files:continue
  text=files[name].get('content')
  if not isinstance(text,str):raise SystemExit('Invalid captured source content: '+name)
  selected.append({'path':name,'sha256Utf8':hashlib.sha256(text.encode('utf-8')).hexdigest(),'content':text})
 payload={'purpose':'Focused source only for approved-scenario polishing; excludes evidence packs, databases, .env, CVs, source archives, backups and unrelated files. Source can still contain hard-coded private details: review before sharing.','createdAt':data.get('createdAt'),'branch':data.get('branch'),'head':data.get('head'),'fileCount':len(selected),'files':selected,'optionalMissing':[n for n in OPTIONAL if n not in files]}
 raw=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode('utf-8');destination.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:archive.writestr('scenario-polishing-source.json',raw)
 print('Upload this ZIP, not the original full JSON:',destination.resolve());print('Source files:',len(selected));print('ZIP bytes:',destination.stat().st_size);print('Uncompressed focused JSON bytes:',len(raw));print('No application source, runtime data, Git or production changes. Review source for private hard-coded values before sharing.')
if __name__=='__main__':main()
