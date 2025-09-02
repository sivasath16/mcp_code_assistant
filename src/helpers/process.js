import { spawn } from "node:child_process";
import { REPO_ROOT } from "./config.js";

export function run(cmd, args, { cwd = REPO_ROOT, timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    let p;
    try {
      p = spawn(cmd, args, { cwd, windowsHide: true });
    } catch (e) {
      return resolve({ code: -1, out: "", err: `Spawn failed: ${e?.message || e}` });
    }
    const timer = setTimeout(() => {
      if (!done) {
        try { p.kill(); } catch {}
        done = true;
        resolve({ code: -2, out, err: `Timed out after ${timeoutMs}ms` });
      }
    }, timeoutMs);
    p.on("error", (e) => {
      if (!done) {
        clearTimeout(timer);
        done = true;
        resolve({ code: -3, out, err: `Spawn error: ${e?.message || e}` });
      }
    });
    p.stdout.on("data", d => (out += d.toString()));
    p.stderr.on("data", d => (err += d.toString()));
    p.on("close", (code) => {
      if (!done) {
        clearTimeout(timer);
        done = true;
        resolve({ code: code ?? 0, out, err });
      }
    });
  });
}
