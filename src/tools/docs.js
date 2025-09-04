import { z } from "zod";
import path from "node:path";
import { safeReadFile } from "../helpers/fs.js";
import { REPO_ROOT, MAX_BYTES } from "../helpers/config.js";
import { run } from "../helpers/process.js";

export function registerDocsTools(server) {
  // --- docs.read -------------------------------------------------------------
  server.registerTool(
    "docs.read",
    {
      title: "Read a documentation file",
      description: "Reads README/ADR/markdown/plaintext docs safely.",
      inputSchema: {
        path: z.string(),                   // relative path within repo
        start: z.number().optional(),       // byte start (default 0)
        end: z.number().optional(),         // byte end (default MAX_BYTES)
      },
    },
    async ({ path: rel, start = 0, end = MAX_BYTES }) => {
      // Allow reading any file (still path-sandboxed by safeReadFile)
      const text = await safeReadFile(rel, start, end);
      return { content: [{ type: "text", text }] };
    }
  );

  // --- docs.search -----------------------------------------------------------
  server.registerTool(
    "docs.search",
    {
      title: "Search docs/README/ADRs",
      description:
        "Ripgrep search limited to docs: docs/, doc/, .github/, and README/adoc/txt.",
      inputSchema: {
        query: z.string(),
        maxResults: z.number().optional(),
      },
    },
    async ({ query, maxResults = 50 }) => {
      const rgCmd = process.env.RG_CMD || "rg";
      const args = [
        "--vimgrep", "-n", "-H",
        "--max-filesize", "1M",
        "--glob", "!.git",
        "--glob", "!node_modules",
        // Include common doc locations / file types
        "-g", "docs/**",
        "-g", "doc/**",
        "-g", ".github/**",
        "-g", "*README*",
        "-g", "**/*.md",
        "-g", "**/*.adoc",
        "-g", "**/*.txt",
        query,
        ".",
      ];

      const { code, out, err } = await run(rgCmd, args, { timeoutMs: 60000 });

      if (code === -3 || (code === -1 && /Spawn failed/.test(err))) {
        throw new Error(
          "ripgrep (rg) not found. Install it or set RG_CMD to its full path in Inspector (Environment Variables)."
        );
      }
      // rg: 0=matches, 1=no matches, >1=error
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

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        // structuredContent: results,
      };
    }
  );

  // --- docs.list_common ------------------------------------------------------
  server.registerTool(
    "docs.list_common",
    {
      title: "List common documentation files",
      description:
        "Lists README and markdown files under docs/, doc/, and .github/ (uses ripgrep --files).",
      inputSchema: { limit: z.number().optional() },
    },
    async ({ limit = 200 }) => {
      const rgCmd = process.env.RG_CMD || "rg";
      // --files lists repo files; -g includes only matched globs
      const args = [
        "--files",
        "-g", "docs/**/*.md",
        "-g", "docs/**/*.adoc",
        "-g", "doc/**/*.md",
        "-g", "doc/**/*.adoc",
        "-g", ".github/**/*.md",
        "-g", "*README*",
        "-g", "**/*.txt",
        "-g", "!node_modules/**",
        "-g", "!.git/**",
        ".",
      ];

      const { code, out, err } = await run(rgCmd, args, { timeoutMs: 20000 });

      if (code < 0) {
        throw new Error(`ripgrep failed: ${err || "unknown error"}`);
      }

      const files = out
        ? out.split("\n").filter(Boolean).slice(0, limit).map(f => path.relative(REPO_ROOT, f))
        : [];

      return {
        content: [{ type: "text", text: JSON.stringify(files, null, 2) }],
        // structuredContent: files,
      };
    }
  );
}
