// Free, local check of the strong-fit paragraph in a polished letter. The AI does not reliably follow "do not repeat
// the bullets", so after each polish this flags: a missing paragraph, figures or near-identical sentences reused from
// the evidence bullets, and future-plan sentences. Warnings only: the letter is never changed here.
const STOP = new Set(['about', 'across', 'after', 'also', 'among', 'and', 'been', 'being', 'both', 'from', 'have', 'into', 'more', 'that', 'than', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'through', 'were', 'what', 'when', 'where', 'which', 'while', 'with', 'within', 'would', 'your']);
const FIGURE = /£\s?\d[\d,.]*\s?(?:k|m|bn|million|billion)?(?:\s?\/\s?(?:year|yr|annum))?|\$\s?\d[\d,.]*\s?(?:k|m|bn|million|billion)?|\d[\d,.]*\s?%|\b\d[\d,]*\+/gi;

const words = text => String(text || '').toLowerCase().match(/[a-z][a-z'-]{3,}/g)?.filter(w => !STOP.has(w)) || [];
const figuresIn = text => [...String(text || '').matchAll(FIGURE)].map(m => m[0].replace(/\s+/g, '').toLowerCase().replace(/\/(?:yr|annum)$/, '/year'));
const sentences = text => String(text || '').split(/(?<=[.!?;])\s+/).map(s => s.trim()).filter(Boolean);
const organisationOf = bullet => /^•\s*At ([^,]{1,80}),/.exec(bullet)?.[1]?.trim() || '';

export function findStrongFitParagraph(draft = '') {
  return String(draft).split(/\r?\n/).map(l => l.trim()).find(l => /^I am a strong fit for\b/i.test(l)) || '';
}

export function strongFitWarnings(draft = '') {
  const lines = String(draft).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const fit = findStrongFitParagraph(draft);
  if (!fit) return ['The strong-fit paragraph ("I am a strong fit for the … role") is missing. Add it, or polish again.'];
  const bullets = lines.filter(l => l.startsWith('•'));
  const warnings = [];
  const bulletFigures = new Set(bullets.flatMap(figuresIn));
  const shown = new Map([...String(fit).matchAll(FIGURE)].map(m => [figuresIn(m[0])[0], m[0].trim()]));
  const repeated = [...new Set(figuresIn(fit).filter(f => bulletFigures.has(f)))].map(f => shown.get(f) || f);
  if (repeated.length) warnings.push(`The strong-fit paragraph repeats ${repeated.length === 1 ? 'a figure' : 'figures'} from the evidence bullets (${repeated.join(', ')}). Use a different achievement if your evidence has one, or edit it.`);
  const echoed = new Set();
  for (const s of sentences(fit)) {
    if (/^I hold\b/i.test(s)) continue;
    const sw = new Set(words(s));
    if (sw.size < 6) continue;
    for (const b of bullets) {
      const bw = new Set(words(b));
      const shared = [...sw].filter(w => bw.has(w)).length;
      if (shared / sw.size >= 0.6) echoed.add(organisationOf(b) || b.slice(2, 40) + '…');
    }
  }
  for (const o of echoed) warnings.push(`The strong-fit paragraph repeats the ${o} evidence bullet almost word for word. Replace it with a different achievement, or edit it.`);
  const future = /\bI (?:would|will|'d|’d|intend to|plan to)\b/i.exec(fit);
  if (future) warnings.push(`The strong-fit paragraph includes a future plan ("${future[0]}"). It should say why you fit, using evidence; edit that sentence.`);
  return warnings;
}
