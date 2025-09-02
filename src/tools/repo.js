import { z } from "zod";
import path from "node:path";
import { safeReadFile } from "../helpers/fs.js";
import { REPO_ROOT, MAX_BYTES } from "../helpers/config.js";
import { run } from "../helpers/process.js";

export function registerRepoTools(server) {
  // --- repo.file ---
  server.registerTool(
    "repo.file",
    {
      title: "Read a file from the repo",
      description: "Safely read a file with size caps (200KB default window).",
      // 👇 plain object schema
      inputSchema: {
        path: z.string(),
        start: z.number().optional(),
        end: z.number().optional(),
      },
    },
    async ({ path: rel, start = 0, end = MAX_BYTES }) => {
      const text = await safeReadFile(rel, start, end);
      return { content: [{ type: "text", text }] };
    }
  );

  // --- repo.search (ripgrep) ---
  server.registerTool(
    "repo.search",
    {
      title: "Search the repo with ripgrep",
      description:
        "Returns file, line, column, and a short match snippet.",
      // 👇 plain object schema
      inputSchema: {
        query: z.string(),
        maxResults: z.number().optional(),
      },
    },
    async ({ query, maxResults = 50 }) => {
      const rgCmd = process.env.RG_CMD || "rg";            // set in Inspector if needed
      const SEARCH_ROOT = process.env.SEARCH_ROOT || ".";  // narrow scope if desired

      const args = [
        "--vimgrep", "-n", "-H",
        "--max-filesize", "1M",
        "--glob", "!.git",
        "--glob", "!node_modules",
        "--glob", "!dist",
        "--glob", "!build",
        "--glob", "!.venv",
        "--glob", "!venv",
        "--glob", "!__pycache__",
        "--glob", "!**/*.min.*",
        query,
        SEARCH_ROOT
      ];

      const { code, out, err } = await run(rgCmd, args, { timeoutMs: 60000 });

      // rg: 0=matches, 1=no matches, >1=error
      if (code === -3 || (code === -1 && /Spawn failed/.test(err))) {
        throw new Error(
          "ripgrep (rg) not found. Install it or set RG_CMD to its full path in Inspector (Environment Variables)."
        );
      }
      if (code > 1) {
        throw new Error(`ripgrep failed: ${err || "unknown error"}`);
      }

      const lines = out ? out.split("\n").filter(Boolean) : [];
      const results = lines.slice(0, maxResults).map(line => {
        const [file, lineNo, col, ...rest] = line.split(":");
        return {
          file: path.relative(REPO_ROOT, file),
          line: Number(lineNo),
          col: Number(col),
          text: rest.join(":").slice(0, 200),
        };
      });

      // ✅ Valid MCP output (no "json" content type)
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        // structuredContent: results,
      };
    }
  );
}
