import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Project-level Hyper3D wiring for AI coding agents, written by
 * `npm run agent -- setup` (also committed to the repo):
 *   .mcp.json              the official Hyper3D MCP server (HTTP)
 *   .claude/settings.json  the official Hyper3D Rodin skill marketplace + plugin
 * Nothing is copied from those projects; they are referenced by URL.
 */
export async function writeAgentSetup() {
  const mcp = { mcpServers: { hyper3d: { type: 'http', url: 'https://api.hyper3d.com/api/mcp' } } };
  const settings = {
    extraKnownMarketplaces: { 'rodin3d-skills': { source: { source: 'github', repo: 'DeemosTech/rodin3d-skills' } } },
    enabledPlugins: { 'rodin3d-skill@rodin3d-skills': true },
  };
  await writeFile(path.join(ROOT, '.mcp.json'), `${JSON.stringify(mcp, null, 2)}\n`);
  await mkdir(path.join(ROOT, '.claude'), { recursive: true });
  await writeFile(path.join(ROOT, '.claude', 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`);
  return ['.mcp.json', '.claude/settings.json'];
}
