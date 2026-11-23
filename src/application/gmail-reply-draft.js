// Creates or updates a Gmail DRAFT reply in the recruiter's thread through the Python worker. Never sends.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function createGmailReplyDraft({threadId, replyToMessageId, to, bodyPlainText, bodyHtml, draftId = '', expectedAddress, env = process.env, spawnImpl = spawn, timeoutMs = 60000}) {
  return new Promise(resolve => {
    let child, out = '', done = false, timer;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); resolve(value); };
    const failed = (code, error) => finish({ok: false, code, error});
    try {
      child = spawnImpl(env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-B', fileURLToPath(new URL('../../python-worker/gmail_reply_draft_worker.py', import.meta.url))],
        {stdio: ['pipe', 'pipe', 'pipe'], env: {...env, PYTHONIOENCODING: 'utf-8:strict'}});
    } catch { failed('DRAFTER_UNAVAILABLE', 'The Gmail draft worker could not start. Check the Python configuration.'); return; }
    // No automatic retry: on a timeout the owner checks Gmail Drafts.
    timer = setTimeout(() => { child.kill(); failed('DRAFT_UNCERTAIN', 'Gmail did not answer in time. Check your Gmail Drafts before trying again.'); }, timeoutMs);
    child.on('error', () => failed('DRAFTER_UNAVAILABLE', 'The Gmail draft worker could not start.'));
    child.stdin.on('error', () => failed('DRAFTER_UNAVAILABLE', 'The Gmail draft worker input failed.'));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { out += chunk; if (out.length > 100000) { child.kill(); failed('DRAFT_FAILED', 'The Gmail draft worker answer was too large.'); } });
    child.stderr.on('data', () => {});
    child.on('close', () => {
      try {
        const value = JSON.parse(out);
        if (value.ok === true && value.draftId && String(value.mailbox || '').toLowerCase() === String(expectedAddress).toLowerCase()) finish(value);
        else if (value.ok === false && typeof value.code === 'string') finish({ok: false, code: value.code, error: String(value.error || 'The Gmail draft failed.')});
        else throw new Error();
      } catch { failed('DRAFT_UNCERTAIN', 'Gmail did not confirm the draft. Check your Gmail Drafts before trying again.'); }
    });
    child.stdin.end(JSON.stringify({action: 'reply_draft', expectedAddress, threadId, replyToMessageId, to, bodyPlainText, bodyHtml, draftId}), 'utf8');
  });
}
