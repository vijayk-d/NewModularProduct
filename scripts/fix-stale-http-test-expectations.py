from __future__ import annotations

from datetime import datetime
from pathlib import Path
import shutil
import sys

TARGET = Path("tests/interfaces/http/create-local-server.test.js")


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    print("No changes were made.")
    raise SystemExit(1)


def replace_one_of(
    text: str,
    alternatives: list[str],
    replacement: str,
    label: str
) -> str:
    matches = [value for value in alternatives if value in text]

    if len(matches) == 0:
        fail(f"Could not find a supported {label} assertion.")

    if len(matches) > 1:
        fail(f"Found multiple supported {label} assertions.")

    return text.replace(matches[0], replacement, 1)


if not TARGET.is_file():
    fail(f"Could not find {TARGET}")

original = TARGET.read_text(encoding="utf-8")
content = original

content = replace_one_of(
    content,
    [
        """  assert.match(
    response.text,
    /The local application could not be prepared\\. Check local configuration and try again\\./
  );""",
        """  assert.match(
    response.text,
    /The local application could not be prepared\\. Check the local server terminal for a diagnostic message, then try again\\./
  );"""
    ],
    """  assert.match(
    response.text,
    /The local application could not be prepared\\. Check the local server terminal for a diagnostic message, then try again\\./
  );""",
    "safe preparation error"
)

content = replace_one_of(
    content,
    [
        """  assert.match(
    response.text,
    /Recruiter or hiring manager:<\\/strong> Hiring Manager/
  );""",
        """  assert.match(
    response.text,
    /Stakeholder source:<\\/strong> Hiring Manager/
  );"""
    ],
    """  assert.match(
    response.text,
    /Stakeholder source:<\\/strong> Hiring Manager/
  );""",
    "stakeholder-source"
)

if content == original:
    print("The two stale HTTP expectations are already aligned.")
    print("No changes were made.")
    raise SystemExit(0)

timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = TARGET.with_name(
    f"{TARGET.name}.{timestamp}.before-stale-http-test-fix.bak"
)

shutil.copy2(TARGET, backup)
TARGET.write_text(content, encoding="utf-8")

print(f"Updated: {TARGET}")
print(f"Backup:  {backup}")
print("Updated the two stale HTTP test expectations.")