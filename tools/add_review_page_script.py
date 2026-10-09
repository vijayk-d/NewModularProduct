from pathlib import Path

target = Path("src/interfaces/http/rendering.js")
lines = target.read_text(encoding="utf-8").splitlines()

body_indexes = [i for i, line in enumerate(lines) if line.strip() == "</body>"]

if len(body_indexes) < 2:
    raise SystemExit(
        f"Expected at least two </body> tags, found {len(body_indexes)}. "
        "No changes were made."
    )

insert_index = body_indexes[1]
script_tag = '      <script type="module" src="/review-page.js" nonce="__SCRIPT_NONCE__"></script>'

if any('/review-page.js' in line for line in lines):
    print("Review-page script tag already exists. No changes made.")
else:
    lines.insert(insert_index, script_tag)
    target.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"Inserted review-page.js script before line {insert_index + 1}")

