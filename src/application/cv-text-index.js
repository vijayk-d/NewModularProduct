// Indexed CV text for ranking. Text is attached only for scoring and removed again before anything is saved,
// so saved applications never carry full CV text.
export function attachIndexedText(inventory, texts = {}) {
  const list = inventory?.cv_inventory?.cvs || inventory?.cvs;
  if (!Array.isArray(list)) return inventory;
  const cvs = list.map(cv => (texts[cv?.role_code] ? {...cv, text: texts[cv.role_code]} : cv));
  return inventory.cv_inventory ? {...inventory, cv_inventory: {...inventory.cv_inventory, cvs}} : {...inventory, cvs};
}

const strip = cv => { if (!cv || typeof cv !== 'object' || !('text' in cv)) return cv; const {text, ...rest} = cv; return rest; };

export function withoutCvText(prepared) {
  if (!prepared || typeof prepared !== 'object') return prepared;
  const out = {...prepared};
  if (Array.isArray(out.rankedCvs)) out.rankedCvs = out.rankedCvs.map(r => ({...r, cv: strip(r.cv)}));
  const inv = out.selectedInventory;
  if (Array.isArray(inv)) out.selectedInventory = inv.map(strip);
  else if (Array.isArray(inv?.cvs)) out.selectedInventory = {...inv, cvs: inv.cvs.map(strip)};
  else if (Array.isArray(inv?.cv_inventory?.cvs)) out.selectedInventory = {...inv, cv_inventory: {...inv.cv_inventory, cvs: inv.cv_inventory.cvs.map(strip)}};
  if (out.recommendation) out.recommendation = {...out.recommendation, bestCv: strip(out.recommendation.bestCv), alternativeCv: strip(out.recommendation.alternativeCv)};
  return out;
}

// "SUMMARY + EXPERIENCE (6 employers)" from the Word section check, for the index and the library page.
export function describeSections(sections) {
  const parts = [];
  if (sections?.profile?.supported) parts.push(sections.profile.heading);
  if (sections?.achievements?.supported) parts.push(sections.achievements.heading);
  if (sections?.experience?.supported) parts.push(`${sections.experience.heading} (${sections.experience.roles.length} employers)`);
  return parts.join(' + ');
}
