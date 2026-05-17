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

// Log de errores del pool para evitar caídas silenciosas
pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = {
  /**
   * Ejecuta una consulta con lógica de reintento simple para mayor resiliencia
   */
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (err) {
      // Si es un error de conexión, reintentamos una vez tras 1.5 segundos
      if (err.code === 'ECONNRESET' || err.code === '57P01' || err.message.includes('terminated')) {
        console.warn(' Conexión de BD perdida. Reintentando consulta...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        return await pool.query(text, params);
      }
      throw err; // Si es otro tipo de error (sintaxis, etc), lo lanzamos
    }
  },
  getClient: () => pool.connect()
};
