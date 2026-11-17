// Bundles the standalone Node entry points (worker, migrations) that run beside Nuxt.
import { cp } from 'node:fs/promises'
import { build } from 'esbuild'

const entries = {
  worker: 'server/worker.ts',
  migrate: 'server/migrate.ts',
}

await Promise.all(
  Object.entries(entries).map(([name, entry]) =>
    build({
      entryPoints: [entry],
      outfile: `.output/${name}/index.mjs`,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      sourcemap: true,
      // pg optionally requires these; they are never used here.
      external: ['pg-native', 'cloudflare:sockets'],
      // Lets bundled CommonJS dependencies call require() for Node built-ins.
      banner: {
        js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
      },
      logLevel: 'info',
    }),
  ),
)

// The bundled migrator looks for SQL files next to itself.
await cp('server/db/migrations', '.output/migrate/migrations', { recursive: true })
