const cron = require('node-cron');
const db = require('../../db');

// Tarea programada: Se ejecuta todos los días a las 00:00 (medianoche)
// Elimina usuarios que llevan más de 24 horas sin verificar su cuenta
cron.schedule('0 0 * * *', async () => {
  console.log('--- Iniciando limpieza de cuentas no verificadas ---');
  try {
    const result = await db.query(
      "DELETE FROM users WHERE is_verified = FALSE AND created_at < NOW() - INTERVAL '24 hours'"
    );
    console.log(`Limpieza completada. Se eliminaron ${result.rowCount} cuentas no verificadas.`);
  } catch (error) {
    console.error('Error durante la limpieza de cuentas:', error);
  }
});

console.log('Sistema de tareas programadas (Cron Jobs) iniciado.');
