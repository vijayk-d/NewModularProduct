// The owner's certifications, kept once in the state folder because role-specific CVs list only some of them.
// Pure rules: names are trimmed, kept to a sensible length and de-duplicated without regard to case.
export const MAX_CERTIFICATIONS = 30;
export const MAX_CERTIFICATION_LENGTH = 120;

export function normaliseCertificationName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, '');
  if (!name) throw Object.assign(new Error('A certification name is empty.'), {code: 'CERTIFICATION_EMPTY'});
  if (name.length > MAX_CERTIFICATION_LENGTH) throw Object.assign(new Error(`"${name.slice(0, 40)}…" is too long (at most ${MAX_CERTIFICATION_LENGTH} characters).`), {code: 'CERTIFICATION_TOO_LONG'});
  if (/[<>{}]/.test(name)) throw Object.assign(new Error(`"${name}" contains characters that are not allowed.`), {code: 'CERTIFICATION_INVALID'});
  return name;
}

export function normaliseCertifications(values) {
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    let name;
    try { name = normaliseCertificationName(value); } catch { continue; }
    if (!out.some(o => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out.slice(0, MAX_CERTIFICATIONS);
}

export function addCertifications(current, names) {
  const list = normaliseCertifications(current), added = [];
  for (const raw of names) {
    const name = normaliseCertificationName(raw);
    if (list.some(o => o.toLowerCase() === name.toLowerCase())) continue;
    if (list.length >= MAX_CERTIFICATIONS) throw Object.assign(new Error(`At most ${MAX_CERTIFICATIONS} certifications can be saved.`), {code: 'CERTIFICATIONS_FULL'});
    list.push(name); added.push(name);
  }
  return {list, added};
}

export function removeCertification(current, raw) {
  const list = normaliseCertifications(current), name = normaliseCertificationName(raw);
  const next = list.filter(o => o.toLowerCase() !== name.toLowerCase());
  return {list: next, removed: next.length !== list.length};
}

// Saved certifications first, then any further ones found in the selected CV.
export function mergeCertifications(saved, fromCv) {
  return normaliseCertifications([...(saved || []), ...(fromCv || [])]);
}
