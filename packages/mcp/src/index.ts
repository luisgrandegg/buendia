import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { BuendiaClient } from "./client.js";
import { registerTools } from "./tools.js";

/**
 * `@buendia/mcp` — Model Context Protocol server for Buendia.
 *
 * Reads:
 *   - `BUENDIA_PAT`        (required) — personal access token from
 *                          `/settings/tokens` on Buendia.
 *   - `BUENDIA_BASE_URL`   (optional) — defaults to `https://buendia.app`.
 *   - `BUENDIA_USER_AGENT` (optional) — extends the default UA string.
 *
 * CLI flags:
 *   --http <port>          serve via Streamable HTTP transport instead of
 *                          stdio. Useful for testing or for clients that
 *                          can't spawn a local process.
 *   --help                 print usage and exit.
 *
 * The server is stateless — every tool call dispatches to Buendia's HTTP
 * API and returns the JSON response (or a Buendia-shaped error).
 */

const PRODUCT_NAME = "Buendia";
const SERVER_NAME = "buendia-mcp";
const SERVER_VERSION = "0.1.0";
const DEFAULT_BASE_URL = "https://buendia.app";

interface ParsedArgs {
  http: number | null;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { http: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--http") {
      const next = argv[i + 1];
      if (!next || Number.isNaN(Number(next))) {
        throw new Error("--http requires a port number, e.g. --http 7400");
      }
      out.http = Number(next);
      i += 1;
      continue;
    }
    if (arg && arg.startsWith("--http=")) {
      const value = arg.slice("--http=".length);
      const num = Number(value);
      if (Number.isNaN(num)) throw new Error("--http=<port> requires a number");
      out.http = num;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

const HELP_TEXT = `\
${PRODUCT_NAME} MCP server (${SERVER_VERSION})

USAGE
  buendia-mcp                    Run over stdio (default; use this with
                                 Claude Desktop / Claude Code).
  buendia-mcp --http <port>      Run over Streamable HTTP at the given port.
  buendia-mcp --help             Print this help.

ENVIRONMENT
  BUENDIA_PAT          Personal access token from ${DEFAULT_BASE_URL}/settings/tokens.
                       Required.
  BUENDIA_BASE_URL     Override the Buendia host. Defaults to ${DEFAULT_BASE_URL}.
  BUENDIA_USER_AGENT   Override the User-Agent header sent to Buendia.

CONFIG SNIPPET (Claude Desktop / Claude Code, ~/.config/claude or equivalent)
  {
    "mcpServers": {
      "buendia": {
        "command": "npx",
        "args": ["-y", "@buendia/mcp"],
        "env": { "BUENDIA_PAT": "buendia_pat_..." }
      }
    }
  }
`;

/**
 * Build a configured McpServer + BuendiaClient. Extracted from `main()`
 * so tests can drive the server without spawning a transport.
 */
export function buildServer(options: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): { server: McpServer; client: BuendiaClient } {
  const client = new BuendiaClient({
    baseUrl: options.baseUrl,
    token: options.token,
    fetchImpl: options.fetchImpl,
    userAgent: process.env.BUENDIA_USER_AGENT ?? `${SERVER_NAME}/${SERVER_VERSION}`,
  });

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server, client, { baseUrlForUser: options.baseUrl });

  return { server, client };
}

async function startStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Don't log to stdout — that's the MCP transport. stderr is fine; the
  // host process surfaces it as the server's diagnostic output.
  process.stderr.write(`[buendia-mcp] listening on stdio\n`);
}

async function startHttp(server: McpServer, port: number): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // The SDK accepts an explicit listening port via the host HTTP server
    // we wrap below; the transport itself reads / writes the request.
  });
  await server.connect(transport);

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      process.stderr.write(`[buendia-mcp] http handler error: ${(err as Error).message}\n`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "transport_error" }));
      }
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  process.stderr.write(`[buendia-mcp] listening on http://127.0.0.1:${port}\n`);
}

async function main(): Promise<void> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${HELP_TEXT}`);
    process.exit(2);
  }

  if (parsed.help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const token = process.env.BUENDIA_PAT;
  if (!token) {
    process.stderr.write(
      "[buendia-mcp] BUENDIA_PAT is not set. Mint one at /settings/tokens and add it to your MCP config.\n",
    );
    process.exit(1);
  }

  const baseUrl = process.env.BUENDIA_BASE_URL ?? DEFAULT_BASE_URL;
  const { server } = buildServer({ baseUrl, token });

  if (parsed.http !== null) {
    await startHttp(server, parsed.http);
  } else {
    await startStdio(server);
  }
}

// Only run when invoked as a binary; importing the module (e.g. from
// tests) should not start a transport.
const invokedDirectly =
  process.argv[1] &&
  (process.argv[1].endsWith("/index.js") || process.argv[1].endsWith("buendia-mcp"));

if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`[buendia-mcp] fatal: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
