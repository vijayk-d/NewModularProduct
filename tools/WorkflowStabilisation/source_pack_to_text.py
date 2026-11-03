"""Convert an existing focused source ZIP into small genuine ASCII text attachments."""
import argparse,base64,hashlib,pathlib
p=argparse.ArgumentParser();p.add_argument('--zip',required=True);p.add_argument('--out',default='docs/scenario-source-text');a=p.parse_args();source=pathlib.Path(a.zip);out=pathlib.Path(a.out)
if not source.is_file():raise SystemExit('Focused ZIP not found. Use the ZIP created by build_scenario_source_pack.py.')
raw=source.read_bytes()
if len(raw)>2*1024*1024:raise SystemExit('Pack is larger than expected. Do not use the original full source capture.')
if out.exists():raise SystemExit('Output folder already exists; choose a new --out folder. Nothing overwritten.')
encoded=base64.b64encode(raw).decode('ascii');chunks=[encoded[i:i+7000] for i in range(0,len(encoded),7000)];checksum=hashlib.sha256(raw).hexdigest();out.mkdir(parents=True)
for i,chunk in enumerate(chunks,1):
 header=f'SCENARIO SOURCE PACK / BASE64 ZIP\nPART {i:03d} OF {len(chunks):03d}\nARCHIVE_SHA256 {checksum}\nCHUNK_SHA256 {hashlib.sha256(chunk.encode()).hexdigest()}\nDATA\n'
 target=out/f'scenario-source-{i:03d}-of-{len(chunks):03d}.txt';target.write_text(header+chunk+'\n',encoding='ascii')
print('Created',len(chunks),'small ASCII .txt files in',out.resolve());print('Upload every numbered .txt part, not the ZIP. Each part has fewer than 7500 characters.');print('Encoding is not encryption. No source, Git, runtime data or production state changed.')
