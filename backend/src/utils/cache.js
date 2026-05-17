const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  connectTimeout: 5000,
  retryStrategy(times) {
    // Reintentar cada 2 segundos si falla
    return 2000;
  },
});

// Forzar intento de conexión al arrancar para ver el estado inmediatamente
redis.connect().catch(() => {});

// Evento de error: Se dispara cuando no puede conectar
redis.on("error", (err) => {
  if (!global.redisErrorLogged) {
    console.warn("\x1b[33m%s\x1b[0m", " AVISO: Redis no está disponible. El sistema funcionará en MODO RESILIENCIA (sin caché).");
    console.error("   Detalle del error:", err.message);
    global.redisErrorLogged = true;
  }
});

// Evento de conexión: Se dispara cuando vuelve a estar online
redis.on("connect", () => {
  console.log("\x1b[32m%s\x1b[0m", " Redis conectado correctamente. Caché activada.");
  global.redisErrorLogged = false;
});

/**
 * Wrappers seguros para evitar que un fallo de Redis rompa la ejecución
 */
const safeRedis = {
  get: async (key) => {
    try {
      if (redis.status !== "ready") return null;
      return await redis.get(key);
    } catch (err) {
      return null;
    }
  },
  set: async (key, value, mode, duration) => {
    try {
      if (redis.status !== "ready") return;
      if (mode && duration) {
        await redis.set(key, value, mode, duration);
      } else {
        await redis.set(key, value);
      }
    } catch (err) {
      // Silencioso para no ensuciar la consola en cada petición
    }
  },
  del: async (key) => {
    try {
      if (redis.status !== "ready") return;
      await redis.del(key);
    } catch (err) {
      // Silencioso
    }
  }
};

async function invalidateMatchCache(matchId) {
  try {
    if (redis.status === "ready") {
        // Borrar datos específicos del partido
        const matchKeys = await redis.keys(`match:${matchId}*`);
        if (matchKeys.length > 0) await redis.del(matchKeys);
        
        // Borrar listados generales de partidos
        await redis.del("all_matches");
        await redis.del("matches:current");

        // Borrar CLASIFICACIONES (Standings) ya que han cambiado los puntos/goles
        const standingsKeys = await redis.keys("standings*");
        if (standingsKeys.length > 0) await redis.del(standingsKeys);
    }
  } catch (err) {
    console.error("Error invalidando caché:", err.message);
  }
}

async function updateGlobalLastActivity() {
  try {
    if (redis.status === "ready") {
      await redis.set("global_last_activity", Date.now());
    }
  } catch (err) {
    console.error("Error actualizando actividad global:", err.message);
  }
}

async function getGlobalLastActivity() {
  try {
    if (redis.status !== "ready") return null;
    return await redis.get("global_last_activity");
  } catch (err) {
    return null;
  }
}

module.exports = {
  redis,
  safeRedis,
  invalidateMatchCache,
  updateGlobalLastActivity,
  getGlobalLastActivity,
  CACHE_TTL_MS: 30
};
