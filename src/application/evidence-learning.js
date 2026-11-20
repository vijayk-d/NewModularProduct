// Evidence engine service: reads the feature snapshot and turns it into evidence statistics, gaps and ranking nudges.
// Local only, recalculated on request from the latest snapshot (rebuilt in the background).
import {learnFromApplications, evidenceKey, learnedBonus, learningNote, MIN_USES_FOR_RATE} from '../domain/insights/evidence-learning.js';

export function createEvidenceLearning({store}) {
  if (!store) throw new Error('Evidence learning needs the insights store.');
  function learn() {
    const {rows, builtAt} = store.features();
    const learned = learnFromApplications(rows);
    const labels = typeof store.evidenceItems === 'function' ? store.evidenceItems() : new Map();
    learned.evidence = learned.evidence.map(e => ({...e, kind: labels.get(e.key)?.kind || (e.key.startsWith('scn:') ? 'scenario' : 'achievement'), label: labels.get(e.key)?.label || ''}));
    return {...learned, builtAt, minUses: MIN_USES_FOR_RATE};
  }
  return {
    summary: learn,
    // Adds what has been learned to each achievement candidate: a note, the numbers and a bounded ranking nudge.
    annotate(catalogue) {
      if (!catalogue || !Array.isArray(catalogue.candidates)) return catalogue;
      let stats;
      try { stats = new Map(learn().evidence.map(e => [e.key, e])); } catch { return catalogue; }
      return {...catalogue, candidates: catalogue.candidates.map(c => {
        const s = stats.get(evidenceKey(c.text));
        return s ? {...c, learning: {uses: s.uses, decided: s.decided, responseRate: s.responseRate, interviews: s.interviews, bonus: learnedBonus(s), note: learningNote(s)}} : c;
      })};
    }
  };
}
