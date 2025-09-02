export function registerHello(server) {
  server.registerResource(
    "hello",
    "hello://world",
    { title: "Hello", description: "Hello world resource" },
    async (uri) => ({
      contents: [{ uri: uri.href, text: "👋 Hello from your MCP server" }],
    })
  );
}
