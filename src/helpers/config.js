// src/helpers/config.js
import path from "node:path";

function getArgValue(flag) {
  // supports: --root C:\path  OR  --root=C:\path
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  const kv = process.argv.find(a => a.startsWith(flag + "="));
  return kv ? kv.split("=", 2)[1] : undefined;
}

const rootFromArg = getArgValue("--root");
const rootFromEnv = process.env.MCP_REPO_ROOT;

// Prefer CLI arg, then env, then cwd
export const REPO_ROOT = path.resolve(rootFromArg || rootFromEnv || process.cwd());

// Optional: narrow searches if you want (used by repo.search/docs.search)
export const SEARCH_ROOT = process.env.SEARCH_ROOT || ".";

// Read caps
export const MAX_BYTES = 200 * 1024;

export function isAllowed(p) {
  const abs = path.resolve(p);
  return abs.startsWith(path.resolve(REPO_ROOT));
}
