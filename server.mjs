import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerPing } from "./src/tools/ping.js";
import { registerRepoTools } from "./src/tools/repo.js";
import { registerGitTools } from "./src/tools/git.js";
import { registerHello } from "./src/resources/hello.js";
import { registerDocsTools } from "./src/tools/docs.js";
import { registerIssuesTools } from "./src/tools/issues.js";
import { registerRuntimeTools } from "./src/tools/runtime.js";

// surface startup errors to STDERR only
process.on("uncaughtException", (e) =>
  process.stderr.write(`[uncaughtException] ${e?.stack || e}\n`)
);
process.on("unhandledRejection", (e) =>
  process.stderr.write(`[unhandledRejection] ${e?.stack || e}\n`)
);

const server = new McpServer({ name: "code-assistant-mcp", version: "0.1.0" });

// Register tools/resources
registerPing(server);
registerRepoTools(server);
registerGitTools(server);
registerHello(server);
registerDocsTools(server);
registerIssuesTools(server);
registerRuntimeTools(server);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);

// IMPORTANT: never log to stdout
process.stderr.write("MCP server running\n");
