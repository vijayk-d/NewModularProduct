const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function renderAchievementPreparation(values={}){
 return `<section id="achievement-preparation" class="achievement-preparation"><h2>Evidence-backed achievements</h2>
 <p>Choosing a CV reads it locally and ticks all its source statements (up to twelve); untick any you do not want included. No AI request runs here. The evidence CV becomes the selected CV for this application.</p>
 <input type="hidden" name="achievementMode" value="selected"><input type="hidden" name="achievementCvRoleCode" value="${esc(values.achievementCvRoleCode||'')}"><input type="hidden" name="achievementSourceHash" value="${esc(values.achievementSourceHash||'')}">
 <div id="achievement-id-fields" data-saved-ids="${esc(JSON.stringify(values.achievementIds||[]))}"></div>
 <div class="achievement-load-row"><label>CV for evidence and attachment<select id="achievement-cv"><option value="">No evidence CV selected</option></select></label><button type="button" id="load-cv-achievements" disabled>Load achievements from this CV</button></div>
 <p id="achievement-status" role="status" aria-live="polite">Loading CV role options…</p>
 <p>SMART indicators identify source wording, not independently verified results. Missing metrics, methods or durations stay missing. Check employer, team contribution and timeframe context before selecting.</p>
 <div id="achievement-options"></div></section>`;
}
export function renderAchievementSummary(data={},selectedCode=''){
 if(!data.achievementMode)return '';
 const proof=data.achievementSelection,items=proof?.items||[];
 return `<section class="review-section achievement-selection-summary"><h2>Selected achievement evidence</h2><p>${items.length} achievement(s) selected. Saved wording and evidence versions are retained; existing queue snapshots are unchanged.</p>
 ${proof?`<p>Source CV: ${esc(proof.roleCode)} — ${esc(proof.roleName)}. Source version: ${esc(proof.sourceHash.slice(0,12))}.</p>`:''}
 ${proof&&proof.roleCode!==selectedCode?'<p role="alert">The selected CV differs from the achievement source. The letter is retained, but polishing requires matching evidence. Restore the original CV or start a new preparation with new evidence.</p>':''}
 ${items.map(x=>`<details><summary>${esc(x.text)}</summary><p>Verbatim source passage; attribution is not inferred.</p><pre>${esc(x.quote)}</pre></details>`).join('')}
 <p>To choose different evidence, start a new preparation. The saved letter remains editable.</p></section>`;
}
