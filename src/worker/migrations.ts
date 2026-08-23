import migration0001 from '../../migrations/0001_init.sql?raw'
import migration0002 from '../../migrations/0002_plugin_states.sql?raw'
import migration0003 from '../../migrations/0003_plugin_configs.sql?raw'
import migration0004 from '../../migrations/0004_client_token_cleanup_plugin.sql?raw'
import migration0005 from '../../migrations/0005_igotify_devices.sql?raw'
import migration0006 from '../../migrations/0006_auth_oidc.sql?raw'
import migration0007 from '../../migrations/0007_gotify_v3_metadata.sql?raw'

const MIGRATIONS = [
  { name: '0001_init.sql', sql: migration0001 },
  { name: '0002_plugin_states.sql', sql: migration0002 },
  { name: '0003_plugin_configs.sql', sql: migration0003 },
  { name: '0004_client_token_cleanup_plugin.sql', sql: migration0004 },
  { name: '0005_igotify_devices.sql', sql: migration0005 },
  { name: '0006_auth_oidc.sql', sql: migration0006 },
  { name: '0007_gotify_v3_metadata.sql', sql: migration0007 }
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
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS d1_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`
    )
    .run()

  const appliedRows = await db
    .prepare('SELECT name FROM d1_migrations')
    .all<{ name: string }>()
  const applied = new Set((appliedRows.results ?? []).map((row) => row.name))

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) {
      continue
    }

    for (const statement of splitSqlStatements(migration.sql)) {
      await db.prepare(statement).run()
    }
    await db
      .prepare('INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)')
      .bind(migration.name)
      .run()
    applied.add(migration.name)
  }
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let statement = ''
  let inString = false

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (char === "'") {
      statement += char
      if (inString && next === "'") {
        statement += next
        index += 1
      } else {
        inString = !inString
      }
      continue
    }

    if (char === ';' && !inString) {
      const trimmed = statement.trim()
      if (trimmed) {
        statements.push(trimmed)
      }
      statement = ''
      continue
    }

    statement += char
  }

  const trimmed = statement.trim()
  if (trimmed) {
    statements.push(trimmed)
  }

  return statements
}
