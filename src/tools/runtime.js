import { z } from "zod";
import { run } from "../helpers/process.js";

export function registerRuntimeTools(server) {
  // --- runtime.processes -----------------------------------------------------
  server.registerTool(
    "runtime_processes",
    {
      title: "List running processes",
      description: "Lists running processes using `ps` (Unix) or `tasklist` (Windows).",
      inputSchema: { limit: z.number().optional() },
    },
    async ({ limit = 30 }) => {
      let cmd, args;
      if (process.platform === "win32") {
        cmd = "tasklist";
        args = ["/FO", "CSV", "/NH"];
      } else {
        cmd = "ps";
        args = ["-eo", "pid,comm,%cpu,%mem", "--sort=-%cpu"];
      }

      const { code, out, err } = await run(cmd, args, { timeoutMs: 10000 });
      if (code !== 0) {
        return { content: [{ type: "text", text: `Failed: ${err}` }] };
      }

      const lines = out.split("\n").filter(Boolean).slice(0, limit);
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        // structuredContent: lines,
      };
    }
  );

  // --- runtime.logs ----------------------------------------------------------
  server.registerTool(
    "runtime_logs",
    {
      title: "Tail a log file",
      description: "Reads the last N lines from a log file.",
      inputSchema: {
        path: z.string(),
        lines: z.number().optional(),
      },
    },
    async ({ path, lines = 50 }) => {
      // On Unix: use tail, on Windows: use Get-Content
      let cmd, args;
      if (process.platform === "win32") {
        cmd = "powershell";
        args = ["-Command", `Get-Content -Path '${path}' -Tail ${lines}`];
      } else {
        cmd = "tail";
        args = ["-n", String(lines), path];
      }

      const { code, out, err } = await run(cmd, args, { timeoutMs: 10000 });
      if (code !== 0) {
        return { content: [{ type: "text", text: `Failed: ${err}` }] };
      }

      return { content: [{ type: "text", text: out }] };
    }
  );

  // --- runtime.port_check ----------------------------------------------------
  server.registerTool(
    "runtime_port_check",
    {
      title: "Check if a port is listening",
      description: "Checks if a TCP port is open on localhost.",
      inputSchema: { port: z.number() },
    },
    async ({ port }) => {
      let cmd, args;
      if (process.platform === "win32") {
        cmd = "netstat";
        args = ["-ano"];
      } else {
        cmd = "lsof";
        args = ["-i", `:${port}`];
      }

      const { code, out, err } = await run(cmd, args, { timeoutMs: 10000 });
      if (code !== 0) {
        return { content: [{ type: "text", text: `Failed: ${err}` }] };
      }

      const found = out.includes(port.toString());
      return {
        content: [
          { type: "text", text: found ? `✅ Port ${port} is open` : `❌ Port ${port} is closed` },
        ],
        // structuredContent: { port, open: found },
      };
    }
  );
}
