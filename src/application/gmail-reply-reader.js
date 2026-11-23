// Read-only: asks the Python worker for replies: in the threads of emails you sent, and recent messages from the contacts.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const gmailReplyReadingEnabled = (env = process.env) => String(env.ENABLE_GMAIL || '').trim().toLowerCase() === 'true'
  && Boolean(String(env.GMAIL_FROM_ADDRESS || '').trim()) && (env.NMP_ENV || 'development') !== 'verification';

export function readGmailReplies({threads = [], fromAddresses = [], after = '', expectedAddress, env = process.env, spawnImpl = spawn, timeoutMs = 60000}) {
  return new Promise(resolve => {
    let child, out = '', done = false, timer;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
    const failed = (code, error) => finish({ok: false, code, error});
    try {
      child = spawnImpl(env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-B', fileURLToPath(new URL('../../python-worker/gmail_reply_reader.py', import.meta.url))],
        {stdio: ['pipe', 'pipe', 'pipe'], env: {...env, PYTHONIOENCODING: 'utf-8:strict'}});
    } catch { failed('READER_UNAVAILABLE', 'The Gmail reader could not start. Check the Python configuration.'); return; }
    timer = setTimeout(() => { child.kill(); failed('READ_TIMEOUT', 'Reading Gmail timed out. Nothing was changed.'); }, timeoutMs);
    child.on('error', () => failed('READER_UNAVAILABLE', 'The Gmail reader could not start.'));
    child.stdin.on('error', () => failed('READER_UNAVAILABLE', 'The Gmail reader input failed.'));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { out += chunk; if (Buffer.byteLength(out) > 500000) { child.kill(); failed('READ_TOO_LARGE', 'The Gmail thread is too large to read here.'); } });
    child.stderr.on('data', () => {});
    child.on('close', () => {
      try {
        const value = JSON.parse(out);
        if (value.ok === true && Array.isArray(value.replies) && String(value.mailbox || '').toLowerCase() === String(expectedAddress).toLowerCase()) finish(value);
        else if (value.ok === false && typeof value.code === 'string') finish({ok: false, code: value.code, error: String(value.error || 'Gmail could not be read.')});
        else throw new Error();
      } catch { failed('READ_FAILED', 'Gmail could not be read. Nothing was changed.'); }
    });
    child.stdin.end(JSON.stringify({action: 'find_replies', threads, fromAddresses, after, expectedAddress}), 'utf8');
  });
}
