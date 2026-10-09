from pathlib import Path

targets = [
    Path("new-modular-product-linkedin-contact-bridge.user.js"),
    Path("linkedin-recruiter-bridge.user-2.js")
]

old = "// @match        https://www.linkedin.com/company/*/people/*"

new_lines = [
    "// @match        https://www.linkedin.com/company/*/people/*",
    "// @match        https://www.linkedin.com/search/results/people/*"
]

for target in targets:
    if not target.exists():
        print(f"SKIPPED: {target} does not exist")
        continue

    text = target.read_text(encoding="utf-8")

    if old in text and "// @match        https://www.linkedin.com/search/results/people/*" not in text:
        text = text.replace(
            old,
            "\n".join(new_lines),
            1
        )
        target.write_text(text, encoding="utf-8", newline="\n")
        print(f"UPDATED: {target}")
    elif "// @match        https://www.linkedin.com/search/results/people/*" in text:
        print(f"ALREADY UPDATED: {target}")
    else:
        print(f"NO MATCH LINE FOUND: {target}")
