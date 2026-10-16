
const MAX_FORM_BODY_BYTES = 64 * 1024;

export async function readFormBody(request,{maxBytes=MAX_FORM_BODY_BYTES}={}) {
  const contentType = String(request.headers['content-type'] || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== 'application/x-www-form-urlencoded') {
    return {
      error: {
        statusCode: 415,
        message: 'Unsupported Media Type'
      }
    };
  }

  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>256*1024)throw new Error('Invalid form size boundary.');
  const chunks=[];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > maxBytes) {
      return {
        error: {
          statusCode: 413,
          message: 'Payload Too Large'
        }
      };
    }

    chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  }

  return {
    values: new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
  };
}

