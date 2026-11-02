# Slice 2: consolidated review workspace

Status: DEVELOPMENT CANDIDATE; production is not changed by this package.

Includes floating section-icon navigation, responsive vacancy/domain row and field grid,
compact expanded ranking summary, adjacent Save/Delete application buttons, contact
commands before their tables, grouped imported-advert metadata, wider one-line history
subjects with horizontal overflow and full subject text retained, and single-select
model/tone cards that preserve the existing submission/cost-confirmation protocol.

New application records use the existing catalogue entry labelled GPT-6 Luna. No ID
is guessed or new provider model added. Existing saved records are not rewritten and
retain their stored choices. Changing cards makes no paid call; the existing local
cost estimate/explicit polishing confirmation still governs provider requests.

Local UI choice caching contains model/tone preferences only, not application text,
credentials or mail data. DOM relocation moves existing nodes/listeners rather than
cloning controls or changing endpoint behaviour. Gmail/Perplexity flags and .env files
are not changed.

SMART achievement wording generation remains OPEN: Slice 1 offers source-backed
passages and evidence indicators, not fully rewritten/approved SMART achievements.
Do not mark that requirement complete because this UI package passes.

Automated component/default/cost-protocol checks are included. Real composed-server
and browser layout verification is required on the complete Windows project. Keep
production usable and do not commit/deploy until development acceptance succeeds.
