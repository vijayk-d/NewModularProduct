from pathlib import Path

target = Path("new-modular-product-linkedin-contact-bridge.user.js")
text = target.read_text(encoding="utf-8")

old = '''    Object.assign(button.style, {
      position: "fixed",
      right: "24px",
      bottom: "24px",
      zIndex: "2147483647",
      padding: "12px 16px",
      border: "0",
      borderRadius: "6px",
      background: "#2563eb",
      color: "#fff",
      font: "600 14px sans-serif",
      cursor: "pointer"
    });'''

new = '''    Object.assign(button.style, {
      position: "fixed",
      left: "0",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: "2147483647",
      padding: "14px 18px",
      border: "2px solid #b45309",
      borderRadius: "0 8px 8px 0",
      background: "#ffd400",
      color: "#111827",
      font: "700 14px sans-serif",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)"
    });'''

if old not in text:
    raise SystemExit(
        "Button style block was not found. No changes were made."
    )

text = text.replace(old, new, 1)
target.write_text(text, encoding="utf-8", newline="\n")
print(f"Updated {target}")
