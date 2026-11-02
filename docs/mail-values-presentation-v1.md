# Gmail backdrop + wrapping organisation values v1

Outgoing HTML gets a pale sky-blue (#f3f9ff) presentation table/cell around the approved body when a NEW MIME message is built. Inner HTML, yellow highlights, signature marker, plain text, recipient, subject and CV bytes remain. No font/line-height rule is introduced. Future draft creation, new/repeat message preparation and explicit app draft updates use the builder. Existing raw Gmail drafts/direct draft sends and sent history are NOT recoloured or migrated. Signature blocks with their own background retain it.

Styling occurs before prepared MIME hashing. Commit uses the same frozen bytes; it does not restyle after approval. The Gmail worker checks and send/unknown-outcome protocol are not changed. No real Gmail operation is performed by install/tests. Gmail dark-mode/mobile rendering may override colours and requires real-client inspection; browser/MIME fixtures are not a Gmail-client certification.

Organisation values use a unique flex-wrap group. Native input names, IDs, checked defaults, label clickability, keyboard behavior and selection serialization remain. Long text wraps inside its label, checkbox aligned at the start. Scope excludes other fieldsets/scenario pickers.

Node tests plus Python fake Gmail tests validate template markup, MIME/identity/signature/highlight and frozen hash. Isolated Playwright config starts NO application web server and blocks network. No DB/schema/env/polishing/sending-permission change. Recent generated-list/onboarding/scenario/send/export patches are preserved via independent rendering/style anchors.
