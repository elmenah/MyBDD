const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

async function initDB() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no está configurada. Agrega la variable de entorno en Render.');
  }

  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('image', 'video')),
      mimetype TEXT NOT NULL,
      size BIGINT NOT NULL,
      url TEXT NOT NULL,
      public_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  return db;
}

module.exports = { initDB, getPool };
