from pathlib import Path
import sys

path = Path("src/interfaces/http/create-local-server.js")
content = path.read_text(encoding="utf-8")

old = """    contacts: await loadReviewContacts(reviewId)
  })
);"""

new = """    contacts: await loadReviewContacts(reviewId),
    contactLinking: await loadContactLinking(reviewId)
  })
);"""

if new in content:
    print("Already applied.")
    sys.exit(0)

if content.count(old) != 1:
    raise SystemExit(
        "Could not find a unique initial review render call. "
        "Please apply the manual one-line change instead."
    )

path.write_text(content.replace(old, new), encoding="utf-8", newline="\n")
print("Added contactLinking to the initial application review.")