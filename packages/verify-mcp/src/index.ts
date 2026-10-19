/**
 * xyntherium-verify-mcp — stdio MCP server.
 *   XYN_API_KEY   required (https://xyntherium.com/account/api-keys)
 *   XYN_BASE_URL  optional (default https://xyntherium.com)
 * Prefer no install at all? Use the hosted server: https://mcp.xyntherium.com/mcp
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

const apiKey = process.env.XYN_API_KEY;
if (!apiKey) {
  process.stderr.write('xyntherium-verify-mcp: set XYN_API_KEY (create one at https://xyntherium.com/account/api-keys), or use the hosted server at https://mcp.xyntherium.com/mcp\n');
  process.exit(1);
}
const server = createServer({ apiKey, ...(process.env.XYN_BASE_URL ? { baseUrl: process.env.XYN_BASE_URL } : {}) });
await server.connect(new StdioServerTransport());
