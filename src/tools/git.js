import { z } from "zod";
import { MAX_BYTES } from "../helpers/config.js";
import { run } from "../helpers/process.js";

export function registerGitTools(server) {
  // --- git.list_changed_files ---
  server.registerTool(
    "git_list_changed_files",
    {
      title: "List changed files",
      description:
        "Shows modified/added/deleted/untracked files (git status --porcelain=v1).",
      // 👇 plain object schema
      inputSchema: { includeUntracked: z.boolean().optional() },
    },
    async ({ includeUntracked = true }) => {
      const check = await run("git", ["rev-parse", "--is-inside-work-tree"]);
      if (!/true/i.test(check.out)) {
        return {
          content: [{ type: "text", text: "Not a git repository." }],
        //   structuredContent: [],
        };
      }

      const args = ["status", "--porcelain"];
      if (!includeUntracked) args.push("--untracked-files=no");

      const { code, out, err } = await run("git", args, { timeoutMs: 20000 });
      if (code !== 0) throw new Error(`git status failed: ${err || "unknown error"}`);

      const rows = out
        .split("\n")
        .map((s) => s.trimEnd())
        .filter(Boolean)
        .map((line) => {
          const status = line.slice(0, 2).trim(); // "M", "A", "D", "R", "??"
          const file = line.slice(3);
          return { status, file };
        });

      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        // structuredContent: rows,
      };
    }
  );

  // --- git.diff_unstaged ---
  server.registerTool(
    "git_diff_unstaged",
    {
      title: "Unified diff of unstaged changes",
      description:
        "Shows working directory changes (git diff --unified=3). Truncated for safety.",
      // 👇 plain object schema
      inputSchema: { maxBytes: z.number().optional(), path: z.string().optional() },
    },
    async ({ maxBytes, path }) => {
      const check = await run("git", ["rev-parse", "--is-inside-work-tree"]);
      if (!/true/i.test(check.out)) {
        return {
          content: [{ type: "text", text: "Not a git repository." }],
        //   structuredContent: { diff: "", truncated: false },
        };
      }

      const cap = Math.min(MAX_BYTES, Math.max(16 * 1024, maxBytes ?? MAX_BYTES)); // 16KB..200KB
      const args = ["diff", "--unified=3"];
      if (path) args.push("--", path);

      const { code, out, err } = await run("git", args, { timeoutMs: 30000 });
      // git: 0=ok, 1=changes (still ok), >1=error
      if (code > 1) throw new Error(`git diff failed: ${err || "unknown error"}`);

      const diff = out.slice(0, cap);
      const truncated = out.length > cap;
      const payload = { diff, truncated, bytes: diff.length };

      return {
        content: [{ type: "text", text: truncated ? `${diff}\n\n…[truncated]` : diff }],
        // structuredContent: payload,
      };
    }
  );
    // --- git.log ---------------------------------------------------------------
  server.registerTool(
    "git_log",
    {
      title: "List recent commits",
      description:
        "Shows recent commits with hash, shortHash, author, date, and subject.",
      // plain-object schema
      inputSchema: { limit: z.number().optional(), path: z.string().optional(), since: z.string().optional() },
    },
    async ({ limit = 10, path, since }) => {
      const check = await run("git", ["rev-parse", "--is-inside-work-tree"]);
      if (!/true/i.test(check.out)) {
        return {
          content: [{ type: "text", text: "Not a git repository." }],
        //   structuredContent: [],
        };
      }

      // Format with tab separators to parse easily
      const fmt = "%H%x09%h%x09%ad%x09%an%x09%s";
      const args = ["log", `-n`, String(limit), `--pretty=format:${fmt}`, "--date=iso"];
      if (since) args.push(`--since=${since}`);
      if (path) { args.push("--", path); }

      const { code, out, err } = await run("git", args, { timeoutMs: 20000 });
      if (code !== 0) {
        return {
          content: [{ type: "text", text: `git log failed: ${err || "unknown error"}` }],
        //   structuredContent: [],
        };
      }

      const lines = out.split("\n").filter(Boolean);
      const commits = lines.map(line => {
        const [hash, shortHash, date, author, ...subjectParts] = line.split("\t");
        return {
          hash,
          shortHash,
          date,           // ISO string
          author,
          subject: subjectParts.join("\t")
        };
      });

      return {
        content: [{ type: "text", text: JSON.stringify(commits, null, 2) }],
        // structuredContent: commits,
      };
    }
  );

  // --- git.commit ------------------------------------------------------------
  server.registerTool(
    "git_commit",
    {
      title: "Create a git commit",
      description:
        "Stages changes (optionally) and creates a commit with the given message.",
      // plain-object schema
      inputSchema: {
        message: z.string(),                 // required commit message
        addAll: z.boolean().optional(),      // stage all changes
        paths: z.array(z.string()).optional(), // or stage only specific paths
        allowEmpty: z.boolean().optional(),  // allow empty commits
      },
    },
    async ({ message, addAll = false, paths = [], allowEmpty = false }) => {
      const check = await run("git", ["rev-parse", "--is-inside-work-tree"]);
      if (!/true/i.test(check.out)) {
        return {
          content: [{ type: "text", text: "Not a git repository." }],
        //   structuredContent: { committed: false },
        };
      }

      // Stage as requested
      if (addAll) {
        const addRes = await run("git", ["add", "-A"], { timeoutMs: 15000 });
        if (addRes.code !== 0) {
          return {
            content: [{ type: "text", text: `git add -A failed: ${addRes.err || "unknown error"}` }],
            // structuredContent: { committed: false },
          };
        }
      } else if (paths.length > 0) {
        const addRes = await run("git", ["add", ...paths], { timeoutMs: 15000 });
        if (addRes.code !== 0) {
          return {
            content: [{ type: "text", text: `git add failed: ${addRes.err || "unknown error"}` }],
            // structuredContent: { committed: false },
          };
        }
      }

      // Build commit args
      const commitArgs = ["commit", "-m", message];
      if (allowEmpty) commitArgs.push("--allow-empty");

      const { code, out, err } = await run("git", commitArgs, { timeoutMs: 20000 });

      // Nothing to commit case (git exits with code 1 and message)
      if (code !== 0) {
        const msg = err || out || "unknown error";
        if (/nothing to commit/i.test(msg)) {
          return {
            content: [{ type: "text", text: "Nothing to commit (working tree clean)." }],
            // structuredContent: { committed: false, reason: "nothing_to_commit" },
          };
        }
        return {
          content: [{ type: "text", text: `git commit failed: ${msg}` }],
        //   structuredContent: { committed: false, error: msg },
        };
      }

      // Grab the new commit hash (HEAD)
      const head = await run("git", ["rev-parse", "HEAD"], { timeoutMs: 10000 });
      const hash = head.out.trim();

      const payload = { committed: true, hash, output: out.trim() };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        // structuredContent: payload,
      };
    }
  );

}
