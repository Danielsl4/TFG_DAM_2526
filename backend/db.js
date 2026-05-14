const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect()
};
