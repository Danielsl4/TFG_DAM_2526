const db = require("../../db");

/**
 * Registra una acción de auditoría en la base de datos.
 * 
 * @param {number} userId - ID del usuario que realiza la acción.
 * @param {string} action - Nombre de la acción (ej: 'UPDATE_SCORE').
 * @param {string} entityType - Tipo de entidad afectada (ej: 'match', 'team').
 * @param {number} entityId - ID de la entidad afectada.
 * @param {object} details - Objeto con detalles adicionales sobre la acción.
 * @param {number|null} seasonId - ID de la temporada relacionada (opcional).
 */
async function logAction(userId, action, entityType, entityId, details = {}, seasonId = null) {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, season_id) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, entityType, entityId, JSON.stringify(details), seasonId]
    );
  } catch (err) {
    console.error("Error al registrar acción en audit_logs:", err);
    // No lanzamos el error para no interrumpir el flujo principal si falla el log
  }
}

module.exports = { logAction };
