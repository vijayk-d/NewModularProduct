# Cover-letter quality instruction pack

This is a specification and source-collection package, not an installed application feature.

Extract into the development repository. Added files are limited to two versioned specifications under docs/ and one collector under tools/maintenance/. Existing application, launcher and .env files are not replaced.

Read docs/senior-cover-letter-quality-instructions-v1.md. The policy JSON is a proposed shared contract; the running application does not yet load it. Do not add unimplemented .env keys.

From the development repository run:

    python tools/maintenance/collect_cover_letter_quality_source.py --root .

Review and attach the generated source-only JSON. The collector prints its location. Do not upload .env or candidate documents. The built-in secret scan is best-effort, so inspect any hard-coded source values before sharing.

Next integration must implement the policy across generation, polishing, final composition, review counts and approval checks, preserving the already verified Slice 2 workspace. CV preview/Word support and scheduled delivery remain separate outstanding requirements, not features delivered by this pack.
