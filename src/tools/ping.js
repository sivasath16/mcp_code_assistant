import { z } from "zod";

export function registerPing(server) {
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Health check",
      // 👇 keep your original “plain object schema” style
      inputSchema: { msg: z.string().optional() },
    },
    async ({ msg }) => ({
      content: [{ type: "text", text: msg ?? "pong" }],
    })
  );
}
