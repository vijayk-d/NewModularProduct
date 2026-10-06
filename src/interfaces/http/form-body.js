
const MAX_FORM_BODY_BYTES = 64 * 1024;

export async function readFormBody(request) {
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

  let body = '';
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > MAX_FORM_BODY_BYTES) {
      return {
        error: {
          statusCode: 413,
          message: 'Payload Too Large'
        }
      };
    }

    body += chunk;
  }

  return {
    values: new URLSearchParams(body)
  };
}
