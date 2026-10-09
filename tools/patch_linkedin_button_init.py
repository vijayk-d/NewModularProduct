from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

old = '''  addButton();

  new MutationObserver(addButton).observe(
    document.documentElement,
    { childList: true, subtree: true }
  );'''

new = '''  function pageIsSupported() {
    return (
      location.pathname.startsWith("/company/") &&
      location.pathname.includes("/people") ||
      location.pathname.startsWith("/search/results/people")
    );
  }

  function installWhenSupported() {
    if (pageIsSupported()) {
      addButton();
    }
  }

  installWhenSupported();

  new MutationObserver(installWhenSupported).observe(
    document.documentElement,
    { childList: true, subtree: true }
  );

  window.addEventListener("popstate", installWhenSupported);
  window.addEventListener("locationchange", installWhenSupported);'''

if old not in text:
    raise SystemExit(
        "Button initialization block was not found. No changes were made."
    )

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print(f"UPDATED: {target}")
