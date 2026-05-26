const { Pool } = require('pg');
require('dotenv').config();

// Ensure connection URI is provided
if (!process.env.DATABASE_URL) {
  console.error("CRITICAL ERROR: DATABASE_URL environment variable is missing.");
}

// Singleton connection pool shared across Vercel Serverless Function hot starts
let pool;

if (!global.pgPool) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for secure SSL handshakes with Supabase
    },
    max: 10,          // Maximum number of connections in the pool
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 5000 // Return an error if connection takes > 5 seconds
  });
  global.pgPool = pool;
} else {
  pool = global.pgPool;
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
