import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import multer from 'multer';
import { Server } from 'socket.io';
import { INTERESTS } from '../shared/catalog';
import type { ClientToServer, LevelsResponse, ServerInfo, ServerToClient } from '../shared/protocol';
import type { ColorName, InterestId } from '../shared/types';
import { config } from './config';
import { RoomManager } from './game/manager';
import { attachRealtime, str } from './realtime';
import { LevelStore } from './services/levels';
import { assistWithLlm, coachWithLlm, identifyObject, llmEnabled, llmLabel } from './services/llm';
import { Store } from './services/store';
import { Studio } from './services/studio';

const VERSION = '0.1.0';


const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const VIRTUAL_NIC = /vmware|virtual|vethernet|hyper-v|wsl|docker|vbox|bluetooth|蓝牙|本地连接\*|local area connection\*|loopback|tailscale|zerotier/i;
const REAL_NIC = /^(wlan|wi-?fi|wlp|wlan0|en0|en1|eth0|ethernet|以太网$)/i;

/** LAN addresses for QR codes, best first: real Wi-Fi/Ethernet with a private IP beats virtual adapters. */
function lanAddresses(): string[] {
  if (process.env.LAN_HOST) return [process.env.LAN_HOST];
  const scored: { ip: string; score: number }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const net of list ?? []) {
      if (net.family !== 'IPv4' || net.internal || net.address.startsWith('169.254.')) continue;
      const score = (PRIVATE_IP.test(net.address) ? 2 : 0) + (REAL_NIC.test(name) ? 3 : 0) - (VIRTUAL_NIC.test(name) ? 4 : 0);
      scored.push({ ip: net.address, score });
    }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.ip);
}

export async function startServer(opts: { port?: number; quiet?: boolean; dataDir?: string } = {}) {
  const port = opts.port ?? config.port;
  const log = opts.quiet ? () => {} : console.log;
  const store = new Store(opts.dataDir ?? config.dataDir);
  await store.init();
  const studio = new Studio(store);
  await studio.init();
  const levels = new LevelStore(store.dataDir);
  await levels.init();

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin && config.allowedOrigins.length && !config.allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'This frontend origin is not allowed.' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  const server = createServer(app);
  const io = new Server<ClientToServer, ServerToClient>(server, {
    cors: { origin: config.allowedOrigins.length ? config.allowedOrigins : true },
    pingInterval: 10_000,
  });

  const serveClient = existsSync(path.join(config.clientDir, 'index.html'));
  const rooms = new RoomManager(io, {
    saveReplay: (replay) => store.saveReplay(replay),
    enrichReplay: async (replay) => {
      const coaching = await coachWithLlm(replay.report);
      if (coaching) {
        replay.coaching = coaching;
        await store.saveReplay(replay);
      }
    },
  });

  // ---------------------------------------------------------------- REST API
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: VERSION, rooms: rooms.size, uptime: Math.round(process.uptime()) });
  });

  app.get('/api/info', (_req, res) => {
    const port = serveClient ? config.port : config.devClientPort;
    const info: ServerInfo = {
      version: VERSION,
      lanUrls: lanAddresses().map((ip) => `http://${ip}:${port}`),
      publicUrl: config.publicUrl,
      features: { rodin: studio.enabled, llm: llmEnabled(), llmModel: llmEnabled() ? config.llm.models.partner[0] : undefined },
      iceServers: config.iceServers,
    };
    res.json(info);
  });

  app.get('/api/items', async (_req, res) => {
    await levels.refresh();
    res.json({ kinds: studio.kinds() });
  });

  app.get('/api/levels', async (_req, res) => {
    const body: LevelsResponse = { levels: await levels.refresh() };
    res.json(body);
  });

  app.get('/api/replays/:id', async (req, res) => {
    const replay = await store.getReplay(req.params.id);
    if (!replay) return void res.status(404).json({ error: 'Replay not found' });
    res.json(replay);
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  app.post('/api/studio/generate', upload.single('image'), (req, res) => {
    if (!studio.enabled) return void res.status(503).json({ error: 'Live generation is off. Set RODIN_API_KEY on the server to enable it.' });
    const file = req.file;
    if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) return void res.status(400).json({ error: 'Please upload a PNG, JPG or WebP photo.' });
    const name = str(req.body?.name, 32).trim();
    if (!name) return void res.status(400).json({ error: 'Give your object a name.' });
    const interest = (INTERESTS.some((i) => i.id === req.body?.interest) ? req.body.interest : 'everyday') as InterestId | 'everyday';
    const colors: ColorName[] = ['red', 'blue', 'yellow', 'green', 'pink', 'purple', 'orange', 'white', 'brown'];
    const color = (colors.includes(req.body?.color) ? req.body.color : 'white') as ColorName;
    const job = studio.submit({
      image: new Uint8Array(file.buffer),
      mime: file.mimetype,
      filename: file.originalname || 'object.png',
      name,
      synonyms: str(req.body?.synonyms, 200).split(','),
      interest,
      color,
      prompt: str(req.body?.prompt, 300) || undefined,
      zh: str(req.body?.zh, 24) || undefined,
      plural: str(req.body?.plural, 40) || undefined,
    });
    res.status(202).json({ jobId: job.id });
  });

  // Object Studio step 1: name the object in the photo (vision model) and check it is a good reference.
  app.post('/api/studio/identify', upload.single('image'), async (req, res) => {
    const file = req.file;
    if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) return void res.status(400).json({ error: 'Please upload a PNG, JPG or WebP photo.' });
    if (!llmEnabled()) return void res.json({ identified: null });
    res.json({ identified: await identifyObject(new Uint8Array(file.buffer), file.mimetype) });
  });

  app.get('/api/studio/jobs/:id', (req, res) => {
    const job = studio.getJob(req.params.id);
    if (!job) return void res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  app.use('/generated', express.static(store.modelDir, { maxAge: '7d', fallthrough: false }));

  // ------------------------------------------------------------ static client
  if (serveClient) {
    app.use(
      express.static(config.clientDir, {
        index: false,
        setHeaders: (res, file) => {
          if (/[\\/]assets[\\/]/.test(file) || file.endsWith('.glb')) res.setHeader('Cache-Control', 'public, max-age=604800');
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(config.clientDir, 'index.html'));
    });
  }

  // ------------------------------------------------------------ realtime
  attachRealtime(io, rooms, { assist: assistWithLlm });

  await new Promise<void>((resolve) => server.listen(port, config.host, resolve));
  const actualPort = (server.address() as { port: number }).port;
  const lan = lanAddresses()[0];
  log(`\n  ObjectTalk server v${VERSION}`);
  log(`  ➜ API + realtime:  http://localhost:${actualPort}`);
  if (serveClient) log(`  ➜ Play:            http://localhost:${actualPort}${lan ? `   (LAN: http://${lan}:${actualPort})` : ''}`);
  else log(`  ➜ Dev client:      http://localhost:${config.devClientPort} (start with npm run dev)`);
  log(`  ➜ Rodin live generation: ${studio.enabled ? 'ON' : 'off (set RODIN_API_KEY)'} · LLM: ${llmEnabled() ? `ON (${llmLabel()})` : 'off (rule brains only)'}\n`);

  const close = () =>
    new Promise<void>((resolve) => {
      rooms.dispose();
      io.close();
      server.close(() => resolve());
    });
  return { port: actualPort, close };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  startServer()
    .then(({ close }) => {
      const shutdown = () => {
        close().then(() => process.exit(0));
        setTimeout(() => process.exit(0), 2000).unref();
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
