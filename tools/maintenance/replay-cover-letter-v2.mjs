import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {replayCapture} from '../../src/application/cover-letter-v2-diagnostics.js';
import {validateQualityV2} from '../../src/application/cover-letter-quality-v2.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
try{
 if(process.argv.length!==2)throw Error('No arguments accepted; only the standard private capture is read.');
 const dir=path.join(root,'output','cover-letter-v2-diagnostics'),file=path.join(dir,'last-failure.json');
 if(await fs.realpath(dir)!==dir||(await fs.lstat(file)).isSymbolicLink())throw Error('Linked capture path refused.');
 const st=await fs.stat(file);if(st.size>1048576)throw Error('Capture exceeds 1 MiB.');
 console.log(JSON.stringify(replayCapture(JSON.parse(await fs.readFile(file,'utf8')),validateQualityV2),null,2));
}catch{console.error('REPLAY STOPPED: no readable bounded private capture. Earlier failures were not captured retroactively. No API call was made.');process.exitCode=1;}
