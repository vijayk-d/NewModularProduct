// Requests that write files on this computer must come from this app's own page, on this computer.
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
export function isLocalSameOrigin(req) {
  const origin = req.headers.origin, host = req.headers.host;
  if (!origin || (origin !== `http://${host}` && origin !== `https://${host}`)) return false;
  if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return false;
  return LOOPBACK.includes(req.socket?.remoteAddress);
}
