const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  connectTimeout: 5000,
  reconnectOnError: () => true
});

redis.on("error", (err) => {
  console.warn("⚠️ Redis connection error:", err.message);
});

/**
 * Función para invalidar TODA la caché de un partido (pública y de usuarios)
 */
async function invalidateMatchCache(matchId) {
  try {
    const db = require("../../db");
    
    // Obtenemos la temporada del partido para invalidar cachés específicas
    const matchRes = await db.query("SELECT season_id FROM matches WHERE id = $1", [matchId]);
    const seasonId = matchRes.rows[0]?.season_id;

    // 1. Borrar listas de partidos globales y clasificaciones
    await redis.del("all_matches");
    await redis.del("matches:current");
    await redis.del("standings");

    // 2. Borrar cachés específicas de la temporada
    if (seasonId) {
      await redis.del(`matches:season:${seasonId}`);
      await redis.del(`standings:${seasonId}`);
    }

    // 3. Borrar inmediatamente el detalle del partido
    await redis.del(`match:${matchId}`);
    
    // 4. Escanear y borrar cachés de usuarios (segmentadas)
    let cursor = '0';
    do {
      // Borrar todas las listas cacheadas de usuarios
      const [newCursor, userKeys] = await redis.scan(cursor, 'MATCH', 'matches:*user*', 'COUNT', 100);
      if (userKeys.length > 0) {
        await redis.del(...userKeys);
      }

      // Borrar todas las versiones cacheadas del detalle de este partido (ej: match:123:user:45)
      const [, matchKeys] = await redis.scan(cursor, 'MATCH', `match:${matchId}*`, 'COUNT', 100);
      if (matchKeys.length > 0) {
        await redis.del(...matchKeys);
      }
      
      cursor = newCursor;
    } while (cursor !== '0');
  } catch (err) {
    console.error("Error invalidando caché de partido:", err);
  }
}

/**
 * Actualiza la marca de tiempo global de la última actividad administrativa
 */
async function updateGlobalLastActivity() {
  try {
    await redis.set("global_last_activity", Date.now());
  } catch (err) {
    console.error("Error actualizando actividad global:", err);
  }
}

/**
 * Obtiene la marca de tiempo global de la última actividad
 */
async function getGlobalLastActivity() {
  try {
    return await redis.get("global_last_activity");
  } catch (err) {
    console.error("Error obteniendo actividad global:", err);
    return null;
  }
}

module.exports = {
  redis,
  invalidateMatchCache,
  updateGlobalLastActivity,
  getGlobalLastActivity,
  CACHE_TTL_MS: 30 // Segundos para borrar la cache
};
