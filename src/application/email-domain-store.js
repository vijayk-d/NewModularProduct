import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = join(__dirname, "..", "..", "data", "email-domain-resolutions.json");

async function load() {
  try {
    return JSON.parse(await readFile(STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function save(store) {
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function createEmailDomainStore() {
  return {
    async get(reviewId) {
      const store = await load();

      return store[reviewId] || null;
    },

    async save(reviewId, resolution) {
      const store = await load();

      store[reviewId] = {
        ...resolution,
        resolvedAt: new Date().toISOString()
      };

      await save(store);

      return store[reviewId];
    }
  };
}
