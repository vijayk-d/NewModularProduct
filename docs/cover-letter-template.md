# Export pack and the cover-letter template

Export pack builds a ZIP for applying through a career portal. It works in development and production.

## What the pack contains
- `<Your_Name>_<Role>_Cover_Letter.docx` and `.pdf`: made from your private Word template. Without a template, only a plain Word letter is included.
- `<Your_Name>_<Role>_CV.pdf` and/or `.docx`: the CV you selected on the review page, in the format you choose next to Export pack (no CV, as saved, PDF, DOCX, or both).
- `cover-letter.txt`, `cover-letter.html`, `cover-letter-export.json` and `application.txt` for your records. `application.txt` says which letter format was used, what was changed and which CV files were included.
- The name comes from `CANDIDATE_DISPLAY_NAME` and the role from the job title, as in Gmail attachments.

## How the letter differs from the Gmail letter
- The greeting line becomes "Dear Hiring Manager/Talent Recruiter,".
- The "I appreciate the convenience of ATS-based applications…" paragraph is removed.
- Each top-level bullet list has one empty line before and after it.
- Bullets, numbering, bold, italic, underline, highlights and links are kept.
- Only the exported copy changes. The saved letter and the Gmail letter are not changed.

## Which CV file is used
- The CV is looked up by its role code in the current CV library, so moving or replacing the file in the library is picked up. If the CV is no longer in the library, export stops and asks you to choose another.
- For a second format, keep both files side by side with the same name, for example `PM/Vijay_CV.pdf` and `PM/Vijay_CV.docx`. If the other format is missing, export stops and says which file name it expected.

## Setting up or replacing the template
Run this from the app folder:

    node tools/maintenance/set-cover-letter-template.mjs "<path to your template.docx>"

- Development keeps the template in `output/cover-letter-export/` (git-ignored), unless `NMP_STATE_DIRECTORY` is set.
- Production: run it from the active release folder with `--state "D:\NewModularProduct-Production\shared\data"`. The template then survives new releases.
- The command test-renders a sample letter and its PDF layout before using the template. If either fails, it keeps the current template and explains what to fix.
- Re-run the command after you edit the template, otherwise exports are refused because the file has changed.

## Template layout rules
- The first two body paragraphs are kept and hold the letterhead (for example your name and contact line). Every body paragraph after them must be empty.
- Do not use a Word page header or footer, fields, text boxes or pictures: the PDF step cannot reproduce them.
- No numbered or bulleted lists in the template itself.
