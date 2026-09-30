import { win32 as path } from 'node:path';

function candidatesFrom(inventory = {}) {
  return inventory.cv_inventory?.cvs || inventory.cvs || [];
}

function normalizedPath(value = '') {
  return path.resolve(String(value));
}

function createSyntheticCv(pathValue, index) {
  const filename = path.basename(pathValue) || pathValue;
  const folder = path.basename(path.dirname(pathValue)) || 'Selected CV';

  const roleName = `${folder} ${filename}`
    .replace(/\.(docx|pdf)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  const tags = roleName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((tag) => tag.length > 2);

  return {
    role_code: `CUSTOM-${index + 1}`,
    role_name: roleName,
    filename,
    folder,
    local_path: pathValue,
    tags,
    use_cases: [],
    priority: 'medium',
    recency: ''
  };
}

export function selectCvsByPath(inventory, selectedCvPaths = []) {
  if (!selectedCvPaths.length) {
    return inventory;
  }

  const cvs = candidatesFrom(inventory);
  const normalizedPaths = selectedCvPaths.map(normalizedPath);

  const selected = normalizedPaths.map((selectedPath, index) => {
    const existing = cvs.find(
      (cv) =>
        cv.local_path &&
        normalizedPath(cv.local_path) === selectedPath
    );

    return existing || createSyntheticCv(selectedPath, index);
  });

  return {
    ...inventory,
    cv_inventory: {
      ...(inventory?.cv_inventory || {}),
      cvs: selected
    }
  };
}
