export const TARGETS=[
  {
    "path": "src/infrastructure/cv-inventory/cv-library-v1.js",
    "blob": "3e192a67c749633ed71b1c94420aa4488469e562",
    "edits": [
      {
        "before": "import {createHash,randomUUID} from 'node:crypto';",
        "after": "import {createHash,randomUUID} from 'node:crypto';\nimport {sharedCvLayout,checkSharedCvOwnership,noLinkedPath,samePath} from '../../config/shared-cv-library-runtime.js';"
      },
      {
        "before": "text(row.role_code,'role code',80)",
        "after": "text(row.role_code,'role code',60)"
      },
      {
        "before": "export function createCvLibrary({projectRoot,cataloguePath,cvFolder,privateDirectory,adapter}){",
        "after": "export function createCvLibrary({projectRoot,cataloguePath,cvFolder,privateDirectory,adapter,sharedDirectory='',mode='development'}){"
      },
      {
        "before": " if(catalogue!==path.join(root,'config','cv-library.json')||privateRoot!==path.join(root,'output','cv-library-v1'))throw fail('Unexpected CV-library storage configuration.');",
        "after": " const shared=Boolean(sharedDirectory);\n if(shared){const layout=sharedCvLayout({projectRoot:root,sharedDirectory,mode});if(!samePath(catalogue,layout.cataloguePath)||!samePath(privateRoot,layout.privateDirectory))throw fail('Shared CV paths do not match the configured layout.');}\n else if(mode!=='development'||catalogue!==path.join(root,'config','cv-library.json')||privateRoot!==path.join(root,'output','cv-library-v1'))throw fail('Unexpected CV-library storage configuration.');\n async function sharedWriter(fn){if(!shared)return fn();await checkSharedCvOwnership(sharedDirectory,cvFolder);const lock=path.join(sharedDirectory,'catalogue-write.lock');let h;try{h=await fs.open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw fail('Shared catalogue is being updated. Reload/retry after the other save; do not delete locks blindly.',409);throw e;}try{return await fn();}finally{await h.close();await fs.unlink(lock);}}"
      },
      {
        "before": "  const realRoot=await fs.realpath(root);\n  await fs.mkdir(privateRoot,{recursive:true});\n  if(await fs.realpath(privateRoot)!==path.join(realRoot,'output','cv-library-v1'))throw fail('Private cache must not be redirected through a link.',409);",
        "after": "  if(shared){const live=await checkSharedCvOwnership(sharedDirectory,cvFolder);await fs.mkdir(privateRoot,{recursive:true});await noLinkedPath(privateRoot);if(!samePath(await fs.realpath(privateRoot),path.join(live,'indexes',mode)))throw fail('Shared cache path was redirected.',409);return;}\n  const realRoot=await fs.realpath(root);\n  await fs.mkdir(privateRoot,{recursive:true});\n  if(await fs.realpath(privateRoot)!==path.join(realRoot,'output','cv-library-v1'))throw fail('Private cache must not be redirected through a link.',409);"
      },
      {
        "before": " async function load(){\n  await noLink",
        "after": " async function load(){\n  if(shared)await checkSharedCvOwnership(sharedDirectory,cvFolder);\n  await noLink"
      },
      {
        "before": "return {etag:c.etag,cvs:c.cvs,indexed:c.cvs.map",
        "after": "return {etag:c.etag,cvs:c.cvs,environment:mode,storage:shared?'shared':'development',cataloguePath:catalogue,indexed:c.cvs.map"
      },
      {
        "before": " async function save({etag,cvs}){return exclusive(async()=>{",
        "after": " async function save({etag,cvs}){return exclusive(()=>sharedWriter(async()=>{"
      },
      {
        "before": "  const backupDir=path.join(privateRoot,'backups');",
        "after": "  if(shared)for(const entry of next.cvs){const prior=before.cvs.find(e=>e.role_code===entry.role_code);if(!prior||prior.local_path!==entry.local_path)await fingerprint(entry);}\n  const backupDir=path.join(shared?sharedDirectory:privateRoot,'backups');"
      },
      {
        "before": "return {etag:(await load()).etag,saved:true};\n });}\n async function reindex",
        "after": "return {etag:(await load()).etag,saved:true};\n }));}\n async function reindex"
      },
      {
        "before": " return {snapshot,validate,inspect,save,reindex,discover};",
        "after": " return {snapshot,validate,inspect,save,reindex,discover,async exportCatalogue(){return {cvs:(await load()).cvs};}};"
      },
      {
        "before": "st.size>25*1024*1024)throw fail('CV is not a regular file below the 25 MiB limit.'",
        "after": "st.size>20*1024*1024)throw fail('CV is not a regular file below the 20 MiB limit.'"
      }
    ]
  },
  {
    "path": "src/interfaces/http/cv-library-v1.js",
    "blob": "bf4fe79e85bd9c70dddfd40b8df988261ca940a5",
    "edits": [
      {
        "before": " if(options.mode!=='development')throw Error('CV library management is development-only.');",
        "after": " if(!['development','production'].includes(options.mode)||(options.mode==='production'&&!options.sharedDirectory))throw Error('CV library management is development-only unless explicitly configured for shared production storage.');"
      },
      {
        "before": "    if(url.pathname==='/api/cv-library/session'){json(res,200,{token});return;}",
        "after": "    if(url.pathname==='/api/cv-library/session'){json(res,200,{token});return;}\n    if(url.pathname==='/api/cv-library/export'){res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-disposition':'attachment; filename=\"cv-library.json\"','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(await library.exportCatalogue(),null,2)+'\\n');return;}"
      }
    ]
  },
  {
    "path": "src/interfaces/http/run-local-server.js",
    "blob": "cd302d4b9d71c502d539ce86f7d58f6c67b98c04",
    "edits": [
      {
        "before": "import { installCvLibrary } from './cv-library-v1.js';",
        "after": "import { installCvLibrary } from './cv-library-v1.js';\nimport {resolveCvLibraryRuntime,assertSharedCvReady} from '../../config/shared-cv-library-runtime.js';"
      },
      {
        "before": "const cvInventoryRepository = createJsonCvInventoryRepository({\n  inventoryPath: config.storage.cvInventoryPath\n});",
        "after": "const cvLibraryRuntime=resolveCvLibraryRuntime({env:process.env,mode:deployment.mode,projectRoot:fileURLToPath(new URL('../../../',import.meta.url)),server:config.server,legacyInventoryPath:config.storage.cvInventoryPath});\nawait assertSharedCvReady(cvLibraryRuntime,config.storage.cvFolder);\nconst cvInventoryRepository = createJsonCvInventoryRepository({\n  inventoryPath: cvLibraryRuntime.inventoryPath\n});"
      },
      {
        "before": "// CV_LIBRARY_V1_BEGIN\nif (deployment.mode === 'development' && config.server.port === 3000 &&\n    ['127.0.0.1', 'localhost', '::1'].includes(config.server.host)) {\n  installCvLibrary(server, {\n    mode: deployment.mode,\n    projectRoot,\n    cataloguePath: path.join(projectRoot, 'config', 'cv-library.json'),\n    cvFolder: config.storage.cvFolder,\n    privateDirectory: path.join(projectRoot, 'output', 'cv-library-v1'),\n    adapter: createCvDocumentAdapter({cvFolder: config.storage.cvFolder})\n  });\n}\n// CV_LIBRARY_V1_END",
        "after": "// CV_LIBRARY_SHARED_V1_BEGIN\nif (cvLibraryRuntime.enabled) {\n  installCvLibrary(server, {\n    mode: deployment.mode,\n    projectRoot,\n    sharedDirectory: cvLibraryRuntime.sharedDirectory || '',\n    cataloguePath: cvLibraryRuntime.cataloguePath,\n    cvFolder: config.storage.cvFolder,\n    privateDirectory: cvLibraryRuntime.privateDirectory,\n    adapter: createCvDocumentAdapter({cvFolder: config.storage.cvFolder})\n  });\n}\n// CV_LIBRARY_SHARED_V1_END"
      }
    ]
  },
  {
    "path": "src/interfaces/http/cv-library-v1.browser.js",
    "blob": "90c886df9fcfd8206ff8dcad585c6564a78da631",
    "edits": [
      {
        "before": "async function reload(){state=await api('/api/cv-library');render();}",
        "after": "async function reload(){state=await api('/api/cv-library');$('notice').textContent=state.storage==='shared'?'Shared CV catalogue · '+state.environment+'. Changes affect new preparations in BOTH environments. Refresh other open pages to see updates. Saved reviews and scheduled messages are not rewritten. Each environment has its own text index.':'Development catalogue. Application selection uses its configured inventory. Original documents are never overwritten by this page.';render();}"
      },
      {
        "before": "if(!confirm('Save this catalogue entry? A private backup is made first. Existing application reviews are not changed.'))return;",
        "after": "if(!confirm(state.storage==='shared'?'Save this SHARED catalogue entry? New preparations in BOTH environments will see it. A metadata backup is made first. Saved reviews and scheduled messages are not rewritten.':'Save this catalogue entry? A private backup is made first. Existing application reviews are not changed.'))return;"
      }
    ]
  },
  {
    "path": "src/interfaces/http/rendering.js",
    "blob": "a12bae8d6c30d31295c837ff2f327c410d6831cb",
    "edits": [
      {
        "before": "libraryLink && window.location.port === '3000' &&",
        "after": "libraryLink && ['3000','3100'].includes(window.location.port) &&"
      }
    ]
  },
  {
    "path": "src/interfaces/http/cv-library-v1.html",
    "blob": "47841a4084727a6424dbac548d26c0fdde35d9f3",
    "edits": [
      {
        "before": "<title>CV Library — Development</title>",
        "after": "<title>CV Library</title>"
      },
      {
        "before": "<button id=\"reload\">Reload</button>",
        "after": "<button id=\"reload\">Reload</button><a href=\"/api/cv-library/export\" download>Export catalogue snapshot</a>"
      },
      {
        "before": "maxlength=\"80\" pattern=\"[A-Za-z0-9][A-Za-z0-9_-]*\"",
        "after": "maxlength=\"60\" pattern=\"[A-Za-z0-9][A-Za-z0-9_-]*\""
      },
      {
        "before": "Development only. This page maintains config/cv-library.json. Your active application inventory, production settings and original CV documents are not changed. Reindexing does not yet change application ranking.",
        "after": "Loading CV-library configuration. Original documents are not overwritten. Reindexing maintains a private text cache; application scoring is unchanged."
      }
    ]
  },
  {
    "path": "tools/maintenance/audit-cv-library-development.mjs",
    "blob": "87f716396210ca0c2b886b95d19a1157c9120584",
    "edits": [
      {
        "before": " const catalogue=path.join(root,'config','cv-library.json'),parsed=await smallJson(catalogue)",
        "after": " const shared=String(env.NMP_CV_LIBRARY_DIRECTORY||'').trim(),catalogue=shared?path.join(path.resolve(shared),'catalogue.json'):path.join(root,'config','cv-library.json'),parsed=await smallJson(catalogue)"
      },
      {
        "before": " const configured=String(env.CV_INVENTORY_PATH||'').trim(),active=configured?path.resolve(root,configured):null;",
        "after": " const configured=shared?catalogue:String(env.CV_INVENTORY_PATH||'').trim(),active=configured?path.resolve(root,configured):null;"
      }
    ]
  }
];
