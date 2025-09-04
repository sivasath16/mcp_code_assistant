import { z } from "zod";
import { run } from "../helpers/process.js";

async function hasGh() {
  const { code } = await run("gh", ["--version"], { timeoutMs: 5000 });
  return code === 0;
}

export function registerIssuesTools(server) {
  // --- issues.list -----------------------------------------------------------
  server.registerTool(
    "issues.list",
    {
      title: "List GitHub issues (requires gh CLI)",
      description:
        "Lists issues via GitHub CLI for the current repo. If gh is not installed or authenticated, returns a helpful message.",
      inputSchema: {
        state: z.string().optional(), // "OPEN", "CLOSED", "ALL"
        limit: z.number().optional(), // default 20
        search: z.string().optional(), // filter by a search query
      },
    },
    async ({ state = "OPEN", limit = 20, search }) => {
      if (!(await hasGh())) {
        return {
          content: [{
            type: "text",
            text: "GitHub CLI (gh) is not installed or not on PATH. Install from https://cli.github.com/ and run `gh auth login`."
          }],
        //   structuredContent: [],
        };
      }

      // Ask gh to output JSON so we can structure it
      const args = ["issue", "list", "--limit", String(limit), "--json",
        "number,title,state,labels,assignees,author,createdAt,updatedAt,url"];

      if (state) args.push("--state", state.toLowerCase()); // open/closed/all
      if (search) args.push("--search", search);

      const { code, out, err } = await run("gh", args, { timeoutMs: 30000 });
      if (code !== 0) {
        return {
          content: [{ type: "text", text: `gh issue list failed: ${err || "unknown error"}` }],
        //   structuredContent: [],
        };
      }

      let items = [];
      try { items = JSON.parse(out); } catch { /* leave empty */ }

      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
        // structuredContent: items,
      };
    }
  );

  // --- prs.list --------------------------------------------------------------
  server.registerTool(
    "prs.list",
    {
      title: "List GitHub pull requests (requires gh CLI)",
      description:
        "Lists PRs via GitHub CLI for the current repo. If gh is not installed or authenticated, returns a helpful message.",
      inputSchema: {
        state: z.string().optional(), // "OPEN", "CLOSED", "MERGED", "ALL"
        limit: z.number().optional(), // default 20
        search: z.string().optional(),
      },
    },
    async ({ state = "OPEN", limit = 20, search }) => {
      if (!(await hasGh())) {
        return {
          content: [{
            type: "text",
            text: "GitHub CLI (gh) is not installed or not on PATH. Install from https://cli.github.com/ and run `gh auth login`."
          }],
        //   structuredContent: [],
        };
      }

      const args = ["pr", "list", "--limit", String(limit), "--json",
        "number,title,state,author,updatedAt,headRefName,url"];

      if (state) args.push("--state", state.toLowerCase()); // open/closed/merged/all
      if (search) args.push("--search", search);

      const { code, out, err } = await run("gh", args, { timeoutMs: 30000 });
      if (code !== 0) {
        return {
          content: [{ type: "text", text: `gh pr list failed: ${err || "unknown error"}` }],
        //   structuredContent: [],
        };
      }

      let items = [];
      try { items = JSON.parse(out); } catch { /* leave empty */ }

      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
        // structuredContent: items,
      };
    }
  );
}
