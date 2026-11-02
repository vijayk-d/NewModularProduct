from pathlib import Path
import shutil
from datetime import datetime

targets = {
    Path("tests/config/runtime-config.test.js"),
    Path("tests/interfaces/http/create-local-server.test.js"),
}

for target in targets:
    if not target.is_file():
        raise SystemExit(f"Missing file: {target}")

    original = target.read_text(encoding="utf-8")
    updated = original

    if target.as_posix().endswith("runtime-config.test.js"):
        old = """  enablePerplexityResearch: false,
  enableCoverLetterRefinement: false,
  enableGmail: false
});"""

        new = """  enablePerplexityResearch: false,
  enableCoverLetterRefinement: false,
  enableGmail: false,
  localDebugLogging: false
});"""

        if old in updated and "localDebugLogging: false" not in updated:
            updated = updated.replace(old, new, 1)

    if target.as_posix().endswith("create-local-server.test.js"):
        old = """  assert.match(response.text, /<form method="post" action="\\\\/applications">/);"""

        new = """  assert.match(
    response.text,
    /<form[^>]*method="post"[^>]*action="\\\\/applications"/
  );"""

        if old not in updated:
            raise SystemExit(
                "Could not find the root-form assertion. "
                "Apply that one-line change manually."
            )

        updated = updated.replace(old, new, 1)

    if updated == original:
        print(f"No change needed: {target}")
        continue

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = target.with_name(f"{target.name}.{stamp}.before-test-alignment.bak")
    shutil.copy2(target, backup)
    target.write_text(updated, encoding="utf-8")

    print(f"Updated: {target}")
    print(f"Backup:  {backup}")