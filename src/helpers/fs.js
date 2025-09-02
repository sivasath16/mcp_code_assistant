import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT, MAX_BYTES, isAllowed } from "./config.js";

export async function safeReadFile(relPath, start = 0, end = MAX_BYTES) {
  const abs = path.resolve(REPO_ROOT, relPath);
  if (!isAllowed(abs)) throw new Error("Access denied: path outside repo");
  const st = await stat(abs);
  if (!st.isFile()) throw new Error("Not a file");
  const buf = await readFile(abs);
  return buf.slice(start, Math.min(end, buf.length)).toString("utf8");
}
