# Cover-letter template for Export pack

Export pack builds a career-portal letter (Word and PDF) from your private Word template. It works in development and production.

## What the exported letter changes
- The greeting line becomes "Dear Hiring Manager/Talent Recruiter,".
- The "I appreciate the convenience of ATS-based applications…" paragraph is removed.
- Bullets, numbering, bold, italic, underline, highlights and links are kept, as in Gmail.
- Only the exported copy changes. The saved letter and the Gmail letter are not changed.
- `application.txt` in the pack says which letter format was used and what was changed.

## Setting up or replacing the template
Run this from the app folder. Run it once for development and once for production.

    node tools/maintenance/set-cover-letter-template.mjs "<path to your template.docx>"

- Development keeps the template in `output/cover-letter-export/` (git-ignored).
- In production, add `--state "<production state folder>"` (the `NMP_STATE_DIRECTORY` folder). The template then survives new releases.
- The command checks that the template works before using it. If the check fails, it leaves the current template in place and explains what to fix.
- Re-run the command after you edit the template, otherwise exports are refused because the file has changed.

## Template layout rules
- Put the letterhead in the Word header.
- The first two body paragraphs are kept (for example a date or reference line). Every body paragraph after them must be empty.
- No numbered or bulleted lists in the template itself.

Without a template, Export pack falls back to a plain Word letter with no header, bullets or highlights, and `application.txt` says so.
