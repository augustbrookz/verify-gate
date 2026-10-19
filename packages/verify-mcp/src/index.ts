/**
 * xyntherium-verify-mcp — stdio MCP server.
 *   XYN_API_KEY   required
 *   XYN_BASE_URL  optional (default https://xyntherium.com)
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Xyntherium } from '../../verify-sdk/src/index';
import { createServer } from './server';

const apiKey = process.env.XYN_API_KEY;
if (!apiKey) {
  process.stderr.write('xyntherium-verify-mcp: set XYN_API_KEY (create one at https://xyntherium.com/account/api-keys)\n');
  process.exit(1);
}
const server = createServer(new Xyntherium({ apiKey, ...(process.env.XYN_BASE_URL ? { baseUrl: process.env.XYN_BASE_URL } : {}) }));
await server.connect(new StdioServerTransport());
