import migration0001 from '../../migrations/0001_init.sql?raw'
import migration0002 from '../../migrations/0002_plugin_states.sql?raw'
import migration0003 from '../../migrations/0003_plugin_configs.sql?raw'
import migration0004 from '../../migrations/0004_client_token_cleanup_plugin.sql?raw'

const MIGRATIONS = [
  { name: '0001_init.sql', sql: migration0001 },
  { name: '0002_plugin_states.sql', sql: migration0002 },
  { name: '0003_plugin_configs.sql', sql: migration0003 },
  { name: '0004_client_token_cleanup_plugin.sql', sql: migration0004 }
] as const

let migrationsPromise: Promise<void> | null = null

export function ensureMigrations(db: D1Database): Promise<void> {
  migrationsPromise ??= applyMigrations(db).catch((error) => {
    migrationsPromise = null
    throw error
  })
  return migrationsPromise
}

async function applyMigrations(db: D1Database): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );`)

  const appliedRows = await db
    .prepare('SELECT name FROM d1_migrations')
    .all<{ name: string }>()
  const applied = new Set(
    (appliedRows.results ?? []).map((row) => row.name)
  )

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) {
      continue
    }

    await db.exec(`${migration.sql}

INSERT OR IGNORE INTO d1_migrations (name) VALUES (${quoteSql(migration.name)});
`)
    applied.add(migration.name)
  }
}

function quoteSql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
