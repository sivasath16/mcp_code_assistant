import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "code-assistant-mcp", version: "0.1.0" });

// Tool: ping
server.registerTool(
  "ping",
  {
    title: "Ping",
    description: "Health check",
    inputSchema: { msg: z.string().optional() },
  },
  async ({ msg }) => ({
    content: [{ type: "text", text: msg ?? "pong" }],
  })
);

// Resource: hello
server.registerResource(
  "hello",
  "hello://world",
  { title: "Hello", description: "Hello world resource" },
  async (uri) => ({
    contents: [{ uri: uri.href, text: "👋 Hello from your MCP server" }],
  })
);

// Wire up stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.log("MCP server is running");
