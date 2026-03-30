import path from "path";
import { fileURLToPath } from "url";
import { mkdir } from "fs/promises";
import { createRequire } from "module";
import pg from "pg";

const { Pool } = pg;
const require = createRequire(import.meta.url);

type SqlJsDatabase = import("sql.js").Database;
type SqlJsValue = import("sql.js").SqlValue;

type SqlDatabaseMode = "postgres" | "sqlite-file" | "sqlite-tmp";

type SqlDatabaseAdapter = {
  mode: SqlDatabaseMode;
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<number>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

function resolvePostgresConnectionString(): string | undefined {
  const direct = firstNonEmpty(
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  );

  if (direct) {
    return direct;
  }

  const host = firstNonEmpty(process.env.POSTGRES_HOST);
  const user = firstNonEmpty(process.env.POSTGRES_USER);
  const password = firstNonEmpty(process.env.POSTGRES_PASSWORD);
  const database = firstNonEmpty(process.env.POSTGRES_DATABASE);
  if (!host || !user || !password || !database) {
    return undefined;
  }

  const port = firstNonEmpty(process.env.POSTGRES_PORT) ?? "5432";
  const sslMode = firstNonEmpty(process.env.POSTGRES_SSLMODE) ?? "require";

  const url = new URL("postgres://placeholder");
  url.username = user;
  url.password = password;
  url.hostname = host;
  url.port = port;
  url.pathname = `/${database}`;
  if (!url.searchParams.get("sslmode")) {
    url.searchParams.set("sslmode", sslMode);
  }

  return url.toString();
}

const POSTGRES_CONNECTION_STRING = resolvePostgresConnectionString();

const SQLITE_DB_PATH = resolveSqliteDbPath();

let adapterPromise: Promise<SqlDatabaseAdapter> | undefined;
let sqlJsPromise: Promise<import("sql.js").SqlJsStatic> | undefined;

function resolveSqliteDbPath(): string {
  const configured = process.env.SQLITE_DB_PATH?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  if (process.env.VERCEL) {
    return path.resolve("/tmp", "et-super-agent", "et-super-agent.db");
  }

  return path.resolve(__dirname, "../../data/et-super-agent.db");
}

function currentMode(): SqlDatabaseMode {
  if (POSTGRES_CONNECTION_STRING) {
    return "postgres";
  }

  if (process.env.VERCEL) {
    return "sqlite-tmp";
  }

  return "sqlite-file";
}

function toPostgresParams(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

async function createPostgresAdapter(connectionString: string): Promise<SqlDatabaseAdapter> {
  const pool = new Pool({ connectionString });

  const adapter: SqlDatabaseAdapter = {
    mode: "postgres",

    async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await pool.query(toPostgresParams(sql), params);
      return result.rows as T[];
    },

    async queryOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      const result = await pool.query(toPostgresParams(sql), params);
      const row = result.rows[0];
      return row ? (row as T) : undefined;
    },

    async run(sql: string, params: unknown[] = []): Promise<number> {
      const result = await pool.query(toPostgresParams(sql), params);
      return result.rowCount ?? 0;
    },
  };

  await ensureSchema(adapter);
  return adapter;
}

async function createSqliteAdapter(filePath: string): Promise<SqlDatabaseAdapter> {
  const SQL = await getSqlJsModule();

  const dbDir = path.dirname(filePath);
  await mkdir(dbDir, { recursive: true });

  const sqliteDb = await loadSqlJsDatabase(SQL, filePath);
  sqliteDb.run("PRAGMA foreign_keys = ON");

  let sqliteQueue: Promise<void> = Promise.resolve();

  function queueOperation<T>(operation: () => Promise<T> | T): Promise<T> {
    const pending = sqliteQueue.then(operation, operation);
    sqliteQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  const adapter: SqlDatabaseAdapter = {
    mode: process.env.VERCEL ? "sqlite-tmp" : "sqlite-file",

    async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      return queueOperation(() => {
        const statement = sqliteDb.prepare(sql);
        try {
          if (params.length > 0) {
            statement.bind(params as SqlJsValue[]);
          }

          const rows: T[] = [];
          while (statement.step()) {
            rows.push(statement.getAsObject() as T);
          }

          return rows;
        } finally {
          statement.free();
        }
      });
    },

    async queryOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      return queueOperation(() => {
        const statement = sqliteDb.prepare(sql);
        try {
          if (params.length > 0) {
            statement.bind(params as SqlJsValue[]);
          }

          if (!statement.step()) {
            return undefined;
          }

          return statement.getAsObject() as T;
        } finally {
          statement.free();
        }
      });
    },

    async run(sql: string, params: unknown[] = []): Promise<number> {
      return queueOperation(async () => {
        const statement = sqliteDb.prepare(sql);
        try {
          if (params.length > 0) {
            statement.bind(params as SqlJsValue[]);
          }

          statement.step();
          const changes = sqliteDb.getRowsModified();
          await persistSqlJsDatabase(sqliteDb, filePath);
          return changes;
        } finally {
          statement.free();
        }
      });
    },
  };

  await ensureSchema(adapter);
  return adapter;
}

async function getSqlJsModule(): Promise<import("sql.js").SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const sqlJsModule = await import("sql.js");
      const initSqlJs = sqlJsModule.default as (config?: import("sql.js").SqlJsConfig) => Promise<import("sql.js").SqlJsStatic>;
      const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");

      return initSqlJs({
        locateFile: () => wasmPath,
      });
    })();
  }

  return sqlJsPromise;
}

async function loadSqlJsDatabase(SQL: import("sql.js").SqlJsStatic, filePath: string): Promise<SqlJsDatabase> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(filePath);
    return new SQL.Database(new Uint8Array(raw));
  } catch {
    return new SQL.Database();
  }
}

async function persistSqlJsDatabase(db: SqlJsDatabase, filePath: string): Promise<void> {
  const fs = await import("fs/promises");
  const binary = db.export();
  await fs.writeFile(filePath, Buffer.from(binary));
}

async function ensureSchema(adapter: SqlDatabaseAdapter): Promise<void> {
  await adapter.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      profile_id TEXT PRIMARY KEY,
      account_ref TEXT,
      profile_answers TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      profile_complete INTEGER NOT NULL DEFAULT 0,
      behavior_doc TEXT,
      login_count INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await adapter.run(`CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email)`);
  await adapter.run(`CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at)`);

  await adapter.run(`
    CREATE TABLE IF NOT EXISTS sub_profiles (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      tags TEXT NOT NULL,
      extracted_context TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(profile_id) REFERENCES profiles(profile_id) ON DELETE CASCADE
    )
  `);

  await adapter.run(`CREATE INDEX IF NOT EXISTS idx_sub_profiles_profile_id ON sub_profiles(profile_id)`);

  await adapter.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      session_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await adapter.run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`);
}

export async function getSqlDatabase(): Promise<SqlDatabaseAdapter> {
  if (!adapterPromise) {
    adapterPromise = POSTGRES_CONNECTION_STRING
      ? createPostgresAdapter(POSTGRES_CONNECTION_STRING)
      : createSqliteAdapter(SQLITE_DB_PATH);
  }

  return adapterPromise;
}

export const sqlDatabaseMeta = {
  mode: currentMode(),
  sqlitePath: SQLITE_DB_PATH,
};
