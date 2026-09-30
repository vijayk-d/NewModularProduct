export function fillTemplate(template = '', values = {}) {
  return String(template).replace(
    /{{\s*([\w]+)\s*}}/g,
    (_, key) => values[key] ?? ''
  );
}
