// Migration entry point: runs pending drizzle-kit migrations, then exits.
// The app container runs it before starting the server.
import { runMigrations } from './db/migrate'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Missing required environment variable DATABASE_URL')

await runMigrations(url)
console.log('[migrate] database is up to date')
