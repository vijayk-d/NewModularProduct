// Background send run: after you approve a batch in the confirmation dialog, the server sends it one email at a time,
// so clicking elsewhere, opening another page or closing the tab does not interrupt it.
// Each email goes through the same sends.commit() as a single send (ticket, expiry, message version, CV bytes, ledger).
// One run at a time. No automatic retries: the first failed or uncertain email stops the run, and the rest are not sent.
export const RUN_GAP_MS = 500, RUN_MAX = 25;

const runError = (message, statusCode = 409, code = 'SEND_RUN_REJECTED') => Object.assign(new Error(message), {statusCode, code});

export function createSendRun({sends, gapMs = RUN_GAP_MS, sleep = ms => new Promise(r => setTimeout(r, ms)), clock = () => Date.now(), log = line => console.info(line), newId = () => 'run-' + clock().toString(36)}) {
  let current = null;

  const snapshot = () => current && {id: current.id, state: current.state, total: current.items.length, done: current.results.length,
    sent: current.results.filter(r => r.kind === 'sent' || r.kind === 'sent_attention').length,
    currentEmail: current.state === 'running' ? current.items[current.results.length]?.email || '' : '',
    stopRequested: current.stopRequested, startedAt: current.startedAt, finishedAt: current.finishedAt || null, results: structuredClone(current.results)};

  async function cancelRest(run, from, kind, message) {
    for (const item of run.items.slice(from)) {
      run.results.push({id: item.queueId, email: item.email, kind, message});
      try { sends.cancel({ticket: item.ticket}); } catch { /* an expired ticket is already gone */ }
    }
  }

  async function loop(run) {
    for (let i = 0; i < run.items.length; i++) {
      if (run.stopRequested) { await cancelRest(run, i, 'stopped', 'Not sent; you stopped the run.'); run.state = 'stopped'; break; }
      if (i > 0) await sleep(gapMs);
      if (run.stopRequested) { await cancelRest(run, i, 'stopped', 'Not sent; you stopped the run.'); run.state = 'stopped'; break; }
      const item = run.items[i];
      try {
        const r = await sends.commit({ticket: item.ticket, confirmed: true, repeatApproved: false});
        log('[OUTREACH_SEND]\n' + JSON.stringify({sent: r.sent, messageId: r.messageId || null, persistenceConfirmed: r.persistenceConfirmed !== false, background: true}, null, 2));
        if (r.sent === true && r.messageId && !r.error) run.results.push({id: item.queueId, email: item.email, kind: 'sent', message: 'Sent messageId: ' + r.messageId, messageId: r.messageId});
        else if (r.sent === true && r.messageId) { run.results.push({id: item.queueId, email: item.email, kind: 'sent_attention', message: `Gmail confirmed ${r.messageId}; persistence needs attention. Do not retry.`, messageId: r.messageId}); run.halted = true; }
        else { run.results.push({id: item.queueId, email: item.email, kind: 'uncertain', message: 'No confirmed send receipt. Check Gmail before retrying.'}); run.halted = true; }
      } catch (e) {
        run.results.push({id: item.queueId, email: item.email, kind: e.code === 'SEND_NOT_ATTEMPTED' ? 'failed_before_send' : 'uncertain', message: e.message});
        run.halted = true;
      }
      if (run.halted) { await cancelRest(run, i + 1, 'stopped', 'Not sent; the run stopped after the email above. Review it before sending the rest.'); run.state = 'halted'; break; }
    }
    if (run.state === 'running') run.state = 'finished';
    run.finishedAt = clock();
  }

  return {
    status: () => snapshot(),
    start({items, confirmed} = {}) {
      if (confirmed !== true) throw runError('Confirm the approved batch before it is sent.', 400, 'SEND_CONFIRMATION');
      if (current?.state === 'running') throw runError('A send run is already in progress. Wait for it, or stop it first.');
      if (!Array.isArray(items) || !items.length || items.length > RUN_MAX) throw runError(`Send between 1 and ${RUN_MAX} approved emails per run.`, 400);
      const seen = new Set();
      const clean = items.map(i => {
        if (!i || typeof i.ticket !== 'string' || !i.ticket || typeof i.queueId !== 'string' || !i.queueId) throw runError('Each email needs its approval ticket.', 400);
        if (seen.has(i.ticket)) throw runError('The same approval appears twice.', 400);
        seen.add(i.ticket);
        return {ticket: i.ticket, queueId: i.queueId, email: String(i.email || '')};
      });
      current = {id: newId(), state: 'running', items: clean, results: [], stopRequested: false, halted: false, startedAt: clock()};
      const run = current;
      run.promise = loop(run).catch(() => { run.state = 'halted'; run.finishedAt = clock(); });
      return snapshot();
    },
    stop() { if (current?.state === 'running') current.stopRequested = true; return snapshot(); },
    // Tests only: wait for the loop to finish.
    settled: () => current?.promise || Promise.resolve()
  };
}
