/** Copy an explicitly selected finished video into this worktree. Never edits the source. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const flag = args.indexOf('--video');
const selected = flag >= 0 ? args[flag + 1] : undefined;
if (!selected) {
  console.error('Usage: npm run pitch:video -- --video "D:\\path\\to\\finished-demo.mp4"');
  process.exit(1);
}
const input = path.resolve(selected);
const extension = path.extname(input).toLowerCase();
if (!['.mp4', '.webm'].includes(extension)) throw new Error('Select an MP4 or WebM video.');
if (!(await stat(input)).isFile()) throw new Error('Video path must be a file.');
const output = path.join(root, 'public', 'pitch', `demo${extension}`);
await mkdir(path.dirname(output), { recursive: true });
if (path.relative(input, output)) await copyFile(input, output);
const configPath = path.join(root, 'src', 'presentation', 'pitch.config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const version = createHash('sha256').update(await readFile(output)).digest('hex').slice(0, 12);
config.video.src = `/pitch/demo${extension}?v=${version}`;
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`Video ready: ${output}\nVite reloads automatically in development. Rebuild before production use.`);
