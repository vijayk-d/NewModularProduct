import {renderApplicationForm} from '../rendering.js';
import {sendHtml} from '../responses.js';

// Optional route factory. The active server retains its existing GET / path.
export function handleApplicationPreparation({writeDiagnostic=()=>{}}={}) {
  return async function handleApplicationPreparationRequest(request,response,url) {
    const method=request.method||'GET';
    const pathname=url?.pathname||new URL(request.url||'/','http://localhost').pathname;
    if(method!=='GET'||pathname!=='/')return false;
    writeDiagnostic('application_form_requested',{method:'GET',route:'/'});
    sendHtml(response,200,renderApplicationForm());
    return true;
  };
}
