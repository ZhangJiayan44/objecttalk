import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const backend = process.env.BACKEND_URL ?? 'http://localhost:8787';
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const deployment = JSON.parse(readFileSync(here('./deployment.config.json'), 'utf8')) as { backendUrl?: string };

const levelsId = 'virtual:objecttalk-levels';

/** The agent-made levels as a module (the in-page server of the static build imports it). */
function shippedLevels(): Plugin {
  return {
    name: 'objecttalk-levels',
    resolveId: (source) => (source === levelsId ? `\0${levelsId}` : null),
    load(id) {
      if (id !== `\0${levelsId}`) return null;
      const dir = here('./content/levels');
      const bundles = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
      return `export const LEVEL_BUNDLES = ${JSON.stringify(bundles)};`;
    },
  };
}

/**
 * GitHub Pages serves the frontend with an optional public Node backend. Without one,
 * browser shims let the game server run in the page. Known pages have static entrances;
 * 404.html provides the application shell for dynamic room and replay links.
 */
function pagesBuild(): Plugin {
  const shims: Record<string, string> = {
    [here('./server/config.ts')]: here('./src/static/shims/config.ts'),
    [here('./server/agent/harness.ts')]: here('./src/static/shims/harness.ts'),
  };
  return {
    name: 'objecttalk-pages',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source === 'nanoid') return here('./src/static/shims/nanoid.ts');
      if (!importer || !source.startsWith('.')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const file = resolved?.id.split('?')[0];
      return file && shims[path.normalize(file)] ? shims[path.normalize(file)] : null;
    },
    closeBundle() {
      const out = here('./dist/pages');
      copyFileSync(path.join(out, 'index.html'), path.join(out, '404.html'));
      for (const route of ['play', 'demo', 'pitch', 'studio', 'progress', 'settings']) {
        const directory = path.join(out, route);
        mkdirSync(directory, { recursive: true });
        copyFileSync(path.join(out, 'index.html'), path.join(directory, 'index.html'));
      }
      writeFileSync(path.join(out, '.nojekyll'), '');
    },
  };
}

// `npm run dev:https` (mode "https") serves a self-signed certificate so phones on the
// same Wi-Fi can use the microphone (browsers only allow mic access on HTTPS or localhost).
export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  const publicBackend = process.env.VITE_BACKEND_URL ?? (mode === 'development' || mode === 'https' ? '' : deployment.backendUrl || '');
  const inPageServer = pages && !publicBackend;
  return {
    base: pages ? (process.env.PAGES_BASE ?? '/ObjectTalk/') : '/',
    // Decided at build time, so the normal build drops the in-page server entirely (and vice versa).
    define: {
      'import.meta.env.VITE_STATIC': JSON.stringify(inPageServer ? '1' : ''),
      'import.meta.env.VITE_BACKEND_URL': JSON.stringify(publicBackend),
      'import.meta.env.VITE_ASSET_VERSION': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || ''),
    },
    plugins: [...(pages ? [pagesBuild()] : []), shippedLevels(), react(), tailwindcss(), ...(mode === 'https' ? [basicSsl()] : [])],
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': here('./src'),
        '@shared': here('./shared'),
        // The in-page server exists only in the static build (Rollup bundles even dead dynamic imports).
        '@static-server': here(inPageServer ? './src/static/server.ts' : './src/static/none.ts'),
      },
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': backend,
        '/generated': backend,
        '/socket.io': { target: backend, ws: true },
      },
    },
    build: {
      outDir: pages ? 'dist/pages' : 'dist/client',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1800,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            r3f: ['@react-three/fiber', '@react-three/drei'],
            react: ['react', 'react-dom', 'react-router'],
          },
        },
      },
    },
  };
});
