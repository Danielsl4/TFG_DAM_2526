const express = require("express");
const router = express.Router();
const db = require("../../db");
const {
  redis,
  safeRedis,
  CACHE_TTL_MS,
  updateGlobalLastActivity,
  getGlobalLastActivity,
  invalidateMatchCache,
} = require("../utils/cache");
const {
  verifyToken,
  optionalVerifyToken,
  verifyReferee,
  verifyMatchLock,
  verifyAdmin,
} = require("../middlewares/auth");
const { logAction } = require("../utils/logger");

// Peticiones en curso para evitar Race Conditions (Thundering Herd)
const inflightRequests = {};

// --- RUTAS DE ADMINISTRACIÓN ---

// Crear un partido manualmente
router.post("/", verifyToken, verifyAdmin, async (req, res) => {
  const {
    date,
    homeTeamId,
    awayTeamId,
    fieldId,
    groupId,
    seasonId,
    phase,
    homePlaceholder,
    awayPlaceholder,
  } = req.body;

  try {
    const query = `
      INSERT INTO matches (
        date, home_team_id, away_team_id, field_id, group_id, season_id, phase, 
        home_team_placeholder, away_team_placeholder, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendiente')
      RETURNING id
    `;
    const values = [
      date,
      homeTeamId || null,
      awayTeamId || null,
      fieldId,
      groupId,
      seasonId,
      phase || "fase_de_grupos",
      homePlaceholder || null,
      awayPlaceholder || null,
    ];

    const result = await db.query(query, values);
    const newMatchId = result.rows[0].id;

    // Invalidar cachés relacionadas de forma segura
    await safeRedis.del("all_matches");
    await safeRedis.del("matches:current");
    await safeRedis.del(`matches:season:${seasonId}`);

    // Auditoría
    await logAction(
      req.authData.id,
      "Creación de partido",
      "match",
      newMatchId,
      {
        homeTeamId,
        awayTeamId,
        date,
        season_id: seasonId,
      },
      seasonId
    );

    res
      .status(201)
      .json({ message: "Partido creado correctamente", id: newMatchId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear el partido" });
  }
});

// Eliminar un partido (BORRADO LÓGICO)
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "UPDATE matches SET is_active = false WHERE id = $1 RETURNING season_id",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Partido no encontrado" });
    }

    const seasonId = result.rows[0].season_id;

    // Invalidar cachés de forma segura
    await safeRedis.del("all_matches");
    await safeRedis.del(`matches:season:${seasonId}`);
    await safeRedis.del(`match:${id}`);

    // Auditoría
    await logAction(req.authData.id, "Eliminación lógica de partido", "match", id);

    res.json({ message: "Partido enviado a la papelera correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar el partido" });
  }
});

// Obtener partidos eliminados (Papelera)
router.get("/admin/trash", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const query = `
      SELECT m.id, m.date, t1.name as home_team_name, t2.name as away_team_name, 
             m.home_team_placeholder, m.away_team_placeholder, s.name as season_name
      FROM matches m
      LEFT JOIN teams t1 ON m.home_team_id = t1.id
      LEFT JOIN teams t2 ON m.away_team_id = t2.id
      JOIN seasons s ON m.season_id = s.id
      WHERE m.is_active = false
      ORDER BY m.date DESC
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener la papelera de partidos" });
  }
});

// Obtener reporte completo de la temporada (Partidos finalizados + eventos)
router.get("/admin/report", verifyToken, verifyAdmin, async (req, res) => {
  const { season_id } = req.query;
  try {
    const matchesQuery = `
      SELECT m.id, m.date, m.home_goals, m.away_goals, 
             m.home_penalty_goals, m.away_penalty_goals,
             t1.name as home_team_name, t2.name as away_team_name,
             m.home_team_placeholder, m.away_team_placeholder,
             m.observations, f.name as field_name, g.name as group_name,
             m.phase
      FROM matches m
      LEFT JOIN teams t1 ON m.home_team_id = t1.id
      LEFT JOIN teams t2 ON m.away_team_id = t2.id
      LEFT JOIN fields f ON m.field_id = f.id
      LEFT JOIN groups g ON m.group_id = g.id
      WHERE m.is_active = true AND m.status = 'finalizado' 
      ${season_id ? "AND m.season_id = $1" : ""}
      ORDER BY m.date ASC
    `;
    const matchResult = await db.query(matchesQuery, season_id ? [season_id] : []);
    const matches = matchResult.rows;

    if (matches.length > 0) {
      const matchIds = matches.map(m => m.id);
      const eventsQuery = `
        SELECT e.id, e.match_id, e.type, p.name as player_name,
               CASE WHEN tp.team_id = m.home_team_id THEN 'home' ELSE 'away' END as team
        FROM match_events e
        JOIN players p ON e.player_id = p.id
        JOIN matches m ON e.match_id = m.id
        LEFT JOIN team_players tp ON tp.player_id = p.id AND tp.season_id = m.season_id
        WHERE e.match_id = ANY($1)
        ORDER BY e.id ASC
      `;
      const eventsResult = await db.query(eventsQuery, [matchIds]);
      const events = eventsResult.rows;

      matches.forEach(m => {
        m.events = events.filter(e => e.match_id === m.id);
      });
    }

    res.json(matches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al generar el reporte" });
  }
});

// Restaurar un partido eliminado
router.post("/:id/restore", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      "UPDATE matches SET is_active = true WHERE id = $1 RETURNING season_id",
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Partido no encontrado" });
    
    const seasonId = result.rows[0].season_id;
    await safeRedis.del("all_matches");
    await safeRedis.del(`matches:season:${seasonId}`);
    
    await logAction(req.authData.id, "Restauración de partido", "match", id);
    res.json({ message: "Partido restaurado correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al restaurar el partido" });
  }
});

// Eliminar un partido definitivamente (Borrado físico de la BD)
router.delete("/:id/permanent", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await db.query("SELECT is_active FROM matches WHERE id = $1", [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: "Partido no encontrado" });
    if (check.rows[0].is_active) return res.status(400).json({ message: "No puedes borrar permanentemente un partido activo. Envíalo primero a la papelera." });

    // Borrado físico (esto sí borrará eventos en cascada si la BD lo permite, o fallará si no)
    // Para matches, permitimos el borrado si ya está en la papelera
    await db.query("DELETE FROM matches WHERE id = $1", [id]);
    
    await logAction(req.authData.id, 'Eliminación permanente de partido', 'match', id);
    res.json({ message: "Partido eliminado definitivamente de la base de datos" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar definitivamente" });
  }
});

// --- RUTAS PÚBLICAS ---

// Obtener última actividad global
router.get("/last-activity", async (req, res) => {
  const timestamp = await getGlobalLastActivity();
  res.json({ timestamp: timestamp ? parseInt(timestamp) : null });
});

// Obtener lista de partidos (calendario)
router.get("/", optionalVerifyToken, async (req, res) => {
  const { season_id } = req.query;
  const userId = req.authData ? req.authData.id : null;

  // Clave de caché segmentada por temporada y usuario
  const baseKey = season_id ? `matches:season:${season_id}` : "matches:current";
  const cacheKey = userId ? `${baseKey}:user:${userId}` : baseKey;

  // Verificar si está en Redis
    const cachedData = await safeRedis.get(cacheKey);
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

  // Si hay una petición IGUAL en marcha, esperamos a que termine
  if (inflightRequests[cacheKey]) {
    try {
      const data = await inflightRequests[cacheKey];
      return res.json(data);
    } catch (err) {
      return res
        .status(500)
        .json({ message: "Error al obtener la lista de partidos" });
    }
  }

  // Si no hay petición en marcha, creamos la "promesa" de ir a la DB
  inflightRequests[cacheKey] = (async () => {
    try {
      const query = `
            SELECT 
                m.id, m.date, m.home_goals, m.away_goals, 
                m.home_penalty_goals, m.away_penalty_goals,
                m.phase, m.status, m.home_team_placeholder, m.away_team_placeholder,
                m.observations,
                t1.id as home_team_id, t1.name as home_team_name, t1.logo_url as home_team_logo,
                t2.id as away_team_id, t2.name as away_team_name, t2.logo_url as away_team_logo,
                f.id as field_id, f.name as field_name, f.location as field_location,
                g.name as group_name,
                TO_CHAR(m.date, 'YYYY-MM-DD"T"HH24:MI:SS') as date_iso,
                EXTRACT(DOW FROM m.date) as day_index,
                (SELECT COUNT(*) FROM match_votes WHERE match_id = m.id AND vote = 'local') as votes_local,
                (SELECT COUNT(*) FROM match_votes WHERE match_id = m.id AND vote = 'empate') as votes_empate,
                (SELECT COUNT(*) FROM match_votes WHERE match_id = m.id AND vote = 'visitante') as votes_visitante,
                mv.vote as user_vote
            FROM matches m
            LEFT JOIN teams t1 ON m.home_team_id = t1.id
            LEFT JOIN teams t2 ON m.away_team_id = t2.id
            LEFT JOIN fields f ON m.field_id = f.id
            LEFT JOIN groups g ON m.group_id = g.id
            LEFT JOIN match_votes mv ON mv.match_id = m.id AND mv.user_id = $1
            JOIN seasons s ON m.season_id = s.id
            WHERE m.is_active = true AND ${season_id ? "m.season_id = $2" : "s.is_active = true"}
            ORDER BY m.date ASC, m.id ASC
        `;
      const params = season_id ? [userId, season_id] : [userId];
      const result = await db.query(query, params);

      const daysMap = {
        0: "Domingo",
        1: "Lunes",
        2: "Martes",
        3: "Miércoles",
        4: "Jueves",
        5: "Viernes",
        6: "Sábado",
      };

      const formattedMatches = result.rows.map((row) => ({
        id: row.id,
        date: row.date_iso,
        homeTeam: row.home_team_id
          ? {
              id: row.home_team_id,
              name: row.home_team_name,
              logoUrl:
                row.home_team_logo ||
                "https://res.cloudinary.com/dyxl1d54d/image/upload/v1777505576/tfg_futsal/general/logogenericoequipo.webp",
            }
          : null,
        awayTeam: row.away_team_id
          ? {
              id: row.away_team_id,
              name: row.away_team_name,
              logoUrl:
                row.away_team_logo ||
                "https://res.cloudinary.com/dyxl1d54d/image/upload/v1777505576/tfg_futsal/general/logogenericoequipo.webp",
            }
          : null,
        homeTeamPlaceholder: row.home_team_placeholder,
        awayTeamPlaceholder: row.away_team_placeholder,
        homeGoals: row.home_goals,
        awayGoals: row.away_goals,
        homePenaltyGoals: row.home_penalty_goals,
        awayPenaltyGoals: row.away_penalty_goals,
        field: {
          id: row.field_id,
          name: row.field_name,
          location: row.field_location,
        },
        status: row.status,
        phase: row.phase,
        groupName: row.group_name,
        dayOfWeek:
          row.day_index !== null ? daysMap[Math.floor(row.day_index)] : null,
        observations: row.observations,
        userVote: row.user_vote,
        votingStats: {
          local: parseInt(row.votes_local) || 0,
          draw: parseInt(row.votes_empate) || 0,
          away: parseInt(row.votes_visitante) || 0,
          total:
            (parseInt(row.votes_local) || 0) +
            (parseInt(row.votes_empate) || 0) +
            (parseInt(row.votes_visitante) || 0),
        },
      }));

      // Guardar en Redis de forma segura
      await safeRedis.set(
        cacheKey,
        JSON.stringify(formattedMatches),
        "EX",
        CACHE_TTL_MS,
      );
      return formattedMatches;
    } finally {
      delete inflightRequests[cacheKey];
    }
  })();

  try {
    const matches = await inflightRequests[cacheKey];
    res.json(matches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener la lista de partidos" });
  }
});

// Obtener detalle de un partido por ID
router.get("/:id", optionalVerifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.authData ? req.authData.id : null;
  const cacheKey = userId ? `match:${id}:user:${userId}` : `match:${id}`;

    const cachedData = await safeRedis.get(cacheKey);
    if (cachedData) return res.json(JSON.parse(cachedData));

  if (inflightRequests[id]) {
    try {
      const data = await inflightRequests[id];
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ message: "Error al obtener el partido" });
    }
  }

  inflightRequests[id] = (async () => {
    try {
      const query = `
            SELECT 
                m.id, m.date, m.home_goals, m.away_goals, 
                m.home_penalty_goals, m.away_penalty_goals,
                m.phase, m.status, m.home_team_placeholder, m.away_team_placeholder,
                m.observations,
                t1.id as home_team_id, t1.name as home_team_name, t1.logo_url as home_team_logo,
                t2.id as away_team_id, t2.name as away_team_name, t2.logo_url as away_team_logo,
                f.id as field_id, f.name as field_name, f.location as field_location,
                g.name as group_name,
                TO_CHAR(m.date, 'YYYY-MM-DD"T"HH24:MI:SS') as date_iso,
                (SELECT COUNT(*) FROM match_votes WHERE match_id = m.id AND vote = 'local') as votes_local,
                (SELECT COUNT(*) FROM match_votes WHERE match_id = m.id AND vote = 'empate') as votes_empate,
                (SELECT COUNT(*) FROM match_votes WHERE match_id = m.id AND vote = 'visitante') as votes_visitante,
                mv.vote as user_vote
            FROM matches m
            LEFT JOIN teams t1 ON m.home_team_id = t1.id
            LEFT JOIN teams t2 ON m.away_team_id = t2.id
            LEFT JOIN fields f ON m.field_id = f.id
            LEFT JOIN groups g ON m.group_id = g.id
            LEFT JOIN match_votes mv ON mv.match_id = m.id AND mv.user_id = $2
            WHERE m.id = $1
        `;
      const result = await db.query(query, [id, userId]);
      if (result.rows.length === 0) return null;

      const row = result.rows[0];

      const eventsQuery = `
          SELECT 
              e.id, e.type, p.id as player_id, p.name as player_name,
              CASE WHEN tp.team_id = m.home_team_id THEN 'home' ELSE 'away' END as team
          FROM match_events e
          JOIN players p ON e.player_id = p.id
          JOIN matches m ON e.match_id = m.id
          LEFT JOIN team_players tp ON tp.player_id = p.id AND tp.season_id = m.season_id
          WHERE e.match_id = $1
          ORDER BY e.id ASC
      `;
      const eventsResult = await db.query(eventsQuery, [id]);

      const typeMapping = {
        gol: "goal",
        tarjeta_amarilla: "yellow_card",
        tarjeta_roja: "red_card",
        penalti_tanda_marcado: "penalty_shootout_goal",
        penalti_tanda_fallado: "penalty_shootout_miss",
      };

      const match = {
        id: row.id,
        date: row.date_iso,
        homeTeam: row.home_team_id
          ? {
              id: row.home_team_id,
              name: row.home_team_name,
              logoUrl:
                row.home_team_logo ||
                "https://res.cloudinary.com/dyxl1d54d/image/upload/v1777505576/tfg_futsal/general/logogenericoequipo.webp",
            }
          : null,
        awayTeam: row.away_team_id
          ? {
              id: row.away_team_id,
              name: row.away_team_name,
              logoUrl:
                row.away_team_logo ||
                "https://res.cloudinary.com/dyxl1d54d/image/upload/v1777505576/tfg_futsal/general/logogenericoequipo.webp",
            }
          : null,
        homeTeamPlaceholder: row.home_team_placeholder,
        awayTeamPlaceholder: row.away_team_placeholder,
        homeGoals: row.home_goals,
        awayGoals: row.away_goals,
        homePenaltyGoals: row.home_penalty_goals,
        awayPenaltyGoals: row.away_penalty_goals,
        field: {
          id: row.field_id,
          name: row.field_name,
          location: row.field_location,
        },
        status: row.status,
        phase: row.phase,
        groupName: row.group_name,
        observations: row.observations,
        userVote: row.user_vote,
        votingStats: {
          local: parseInt(row.votes_local) || 0,
          draw: parseInt(row.votes_empate) || 0,
          away: parseInt(row.votes_visitante) || 0,
          total:
            (parseInt(row.votes_local) || 0) +
            (parseInt(row.votes_empate) || 0) +
            (parseInt(row.votes_visitante) || 0),
        },
        events: eventsResult.rows.map((event) => ({
          id: event.id,
          type: typeMapping[event.type] || event.type,
          player: { id: event.player_id, name: event.player_name },
          team: event.team,
        })),
      };

      await safeRedis.set(cacheKey, JSON.stringify(match), "EX", CACHE_TTL_MS);
      return match;
    } finally {
      delete inflightRequests[id];
    }
  })();

  try {
    const match = await inflightRequests[id];
    if (!match)
      return res.status(404).json({ message: "Partido no encontrado" });
    res.json(match);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener el partido" });
  }
});

// Votar en un partido
router.post("/:id/vote", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { vote } = req.body;
  const userId = req.authData.id;

  if (!["local", "empate", "visitante"].includes(vote)) {
    return res.status(400).json({ message: "Voto no válido" });
  }

  try {
    const matchResult = await db.query(
      "SELECT status, home_team_id, away_team_id FROM matches WHERE id = $1",
      [id],
    );
    if (matchResult.rows.length === 0)
      return res.status(404).json({ message: "Partido no encontrado" });

    const match = matchResult.rows[0];
    if (match.status !== "pendiente" && match.status !== null) {
      return res.status(400).json({
        message:
          "No se puede votar en un partido que ya ha comenzado o finalizado",
      });
    }
    if (match.home_team_id === null || match.away_team_id === null) {
      return res.status(400).json({
        message:
          "No se puede votar en un partido donde los equipos no están definidos",
      });
    }

    await db.query(
      `
      INSERT INTO match_votes (match_id, user_id, vote) VALUES ($1, $2, $3)
      ON CONFLICT (match_id, user_id) DO UPDATE SET vote = EXCLUDED.vote
    `,
      [id, userId, vote],
    );

    const statsResult = await db.query(
      `
      SELECT 
        (SELECT COUNT(*) FROM match_votes WHERE match_id = $1 AND vote = 'local') as votes_local,
        (SELECT COUNT(*) FROM match_votes WHERE match_id = $1 AND vote = 'empate') as votes_empate,
        (SELECT COUNT(*) FROM match_votes WHERE match_id = $1 AND vote = 'visitante') as votes_visitante
    `,
      [id],
    );

    const row = statsResult.rows[0];
    const votingStats = {
      local: parseInt(row.votes_local) || 0,
      draw: parseInt(row.votes_empate) || 0,
      away: parseInt(row.votes_visitante) || 0,
      total:
        (parseInt(row.votes_local) || 0) +
        (parseInt(row.votes_empate) || 0) +
        (parseInt(row.votes_visitante) || 0),
    };

    res.json({ message: "Voto registrado correctamente", votingStats });

    // Invalidación manual de caché de forma segura
    await safeRedis.del(`match:${id}`);
    await safeRedis.del(`match:${id}:user:${userId}`);
    await safeRedis.del("all_matches");
    await safeRedis.del(`matches_user_${userId}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al registrar el voto" });
  }
});

// --- RUTA DE GESTIÓN (ÁRBITROS / ADMINS) ---

// Bloquear partido
router.post("/:id/lock", verifyToken, verifyReferee, async (req, res) => {
  const { id } = req.params;
  const userId = req.authData.id;

  try {
    const query = `
      UPDATE matches SET locked_by = $1, locked_at = NOW() WHERE id = $2 
      AND (locked_by = $1 OR locked_at IS NULL OR locked_at < NOW() - INTERVAL '2 minutes')
      RETURNING id, (SELECT username FROM users WHERE id = matches.locked_by) as current_owner
    `;
    const result = await db.query(query, [userId, id]);
    if (result.rows.length > 0)
      return res.json({ message: "Bloqueo obtenido/renovado", success: true });

    const ownerRes = await db.query(
      `SELECT u.username FROM matches m JOIN users u ON m.locked_by = u.id WHERE m.id = $1`,
      [id],
    );
    const ownerName = ownerRes.rows[0]?.username || "otro usuario";

    res.status(409).json({
      message: `El partido está siendo editado por ${ownerName}`,
      success: false,
      owner: ownerName,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al gestionar el bloqueo" });
  }
});

// Desbloquear partido
router.post("/:id/unlock", verifyToken, verifyReferee, async (req, res) => {
  const { id } = req.params;
  const userId = req.authData.id;
  const force = req.query.force === "true";

  try {
    const query = `
      UPDATE matches SET locked_by = NULL, locked_at = NULL WHERE id = $1 
      AND (locked_by = $2 OR (SELECT role FROM users WHERE id = $2) = 'admin' OR $3 = true)
      RETURNING id
    `;
    const result = await db.query(query, [id, userId, force]);
    if (result.rows.length > 0)
      return res.json({ message: "Partido desbloqueado correctamente" });
    res
      .status(403)
      .json({ message: "No tienes permiso para liberar este bloqueo" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al desbloquear" });
  }
});

// Cambiar estado
router.put(
  "/:id/status",
  verifyToken,
  verifyReferee,
  verifyMatchLock,
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!["pendiente", "en_curso", "finalizado"].includes(status))
      return res.status(400).json({ message: "Estado no válido" });

    try {
      await db.query("UPDATE matches SET status = $1 WHERE id = $2", [
        status,
        id,
      ]);
      await invalidateMatchCache(id);
      await updateGlobalLastActivity();
      res.json({ message: `Estado actualizado a ${status}` });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error al actualizar estado" });
    }
  },
);

// Actualizar observaciones
router.put(
  "/:id/observations",
  verifyToken,
  verifyReferee,
  verifyMatchLock,
  async (req, res) => {
    const { id } = req.params;
    const { observations } = req.body;
    try {
      await db.query("UPDATE matches SET observations = $1 WHERE id = $2", [
        observations || null,
        id,
      ]);
      await invalidateMatchCache(id);
      await updateGlobalLastActivity();
      res.json({ message: "Observaciones actualizadas correctamente" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Error al actualizar observaciones" });
    }
  },
);

// Insertar evento
router.post(
  "/:id/events",
  verifyToken,
  verifyReferee,
  verifyMatchLock,
  async (req, res) => {
    const { id: matchId } = req.params;
    const { type, playerId, teamSide } = req.body;
    if (
      ![
        "gol",
        "tarjeta_amarilla",
        "tarjeta_roja",
        "penalti_tanda_marcado",
        "penalti_tanda_fallado",
      ].includes(type) ||
      !playerId ||
      !teamSide
    ) {
      return res
        .status(400)
        .json({ message: "Datos de evento incompletos o inválidos" });
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO match_events (match_id, player_id, type) VALUES ($1, $2, $3)",
        [matchId, playerId, type],
      );
      if (type === "gol") {
        const field = teamSide === "home" ? "home_goals" : "away_goals";
        await client.query(
          `UPDATE matches SET ${field} = ${field} + 1 WHERE id = $1`,
          [matchId],
        );
      } else if (type === "penalti_tanda_marcado") {
        const field =
          teamSide === "home" ? "home_penalty_goals" : "away_penalty_goals";
        await client.query(
          `UPDATE matches SET ${field} = ${field} + 1 WHERE id = $1`,
          [matchId],
        );
      }
      const matchRes = await client.query(
        "SELECT season_id, group_id, home_team_id, away_team_id FROM matches WHERE id = $1",
        [matchId],
      );
      const {
        season_id: seasonId,
        group_id: groupId,
        home_team_id,
        away_team_id,
      } = matchRes.rows[0];
      const teamId = teamSide === "home" ? home_team_id : away_team_id;
      // Solo sumamos a estadísticas individuales si NO es tanda de penaltis
      if (
        type === "gol" ||
        type === "tarjeta_amarilla" ||
        type === "tarjeta_roja"
      ) {
        const statField =
          type === "gol"
            ? "goals"
            : type === "tarjeta_amarilla"
              ? "yellow_cards"
              : "red_cards";
        await client.query(
          `
        INSERT INTO player_stats (player_id, season_id, ${statField}, matches_played) VALUES ($1, $2, 1, 0)
        ON CONFLICT (player_id, season_id) DO UPDATE SET ${statField} = player_stats.${statField} + 1
      `,
          [playerId, seasonId],
        );
        if ((type === "tarjeta_amarilla" || type === "tarjeta_roja") && groupId && teamId) {
          await client.query(
            `
          INSERT INTO team_stats (team_id, group_id, season_id, ${statField}) VALUES ($1, $2, $3, 1)
          ON CONFLICT (team_id, group_id, season_id) DO UPDATE SET ${statField} = team_stats.${statField} + 1
        `,
            [teamId, groupId, seasonId],
          );
        }
      }
      await client.query("COMMIT");
      await invalidateMatchCache(matchId);
      await updateGlobalLastActivity();

      // Auditoría
      await logAction(req.authData.id, "Añadir evento", "match", matchId, {
        type,
        playerId,
        teamSide,
        season_id: seasonId,
      }, seasonId);

      res.json({ message: "Evento registrado correctamente" });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res.status(500).json({ message: "Error al registrar evento" });
    } finally {
      client.release();
    }
  },
);

// Eliminar evento
router.delete(
  "/:matchId/events/:eventId",
  verifyToken,
  verifyReferee,
  verifyMatchLock,
  async (req, res) => {
    const { matchId, eventId } = req.params;
    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      const eventRes = await client.query(
        `
      SELECT e.type, e.player_id, m.season_id, m.group_id, m.home_team_id, m.away_team_id,
             CASE WHEN tp.team_id = m.home_team_id THEN 'home' ELSE 'away' END as side
      FROM match_events e JOIN matches m ON e.match_id = m.id
      JOIN team_players tp ON e.player_id = tp.player_id AND tp.season_id = m.season_id
      WHERE e.id = $1 AND e.match_id = $2
    `,
        [eventId, matchId],
      );
      if (eventRes.rows.length === 0) throw new Error("Evento no encontrado");
      const event = eventRes.rows[0];
      const statField =
        event.type === "gol"
          ? "goals"
          : event.type === "tarjeta_amarilla"
            ? "yellow_cards"
            : "red_cards";
      const isRegularEvent = [
        "gol",
        "tarjeta_amarilla",
        "tarjeta_roja",
      ].includes(event.type);
      const teamId =
        event.side === "home" ? event.home_team_id : event.away_team_id;

      if (event.type === "gol") {
        const field = event.side === "home" ? "home_goals" : "away_goals";
        await client.query(
          `UPDATE matches SET ${field} = GREATEST(0, ${field} - 1) WHERE id = $1`,
          [matchId],
        );
      } else if (event.type === "penalti_tanda_marcado") {
        const field =
          event.side === "home" ? "home_penalty_goals" : "away_penalty_goals";
        await client.query(
          `UPDATE matches SET ${field} = GREATEST(0, ${field} - 1) WHERE id = $1`,
          [matchId],
        );
      }

      if (isRegularEvent) {
        await client.query(
          `UPDATE player_stats SET ${statField} = GREATEST(0, ${statField} - 1) WHERE player_id = $1 AND season_id = $2`,
          [event.player_id, event.season_id],
        );
        if (
          (event.type === "tarjeta_amarilla" ||
          event.type === "tarjeta_roja") && event.group_id && teamId
        ) {
          await client.query(
            `UPDATE team_stats SET ${statField} = GREATEST(0, ${statField} - 1) WHERE team_id = $1 AND group_id = $2 AND season_id = $3`,
            [teamId, event.group_id, event.season_id],
          );
        }
      }
      await client.query("DELETE FROM match_events WHERE id = $1", [eventId]);
      await client.query("COMMIT");
      await invalidateMatchCache(matchId);
      await updateGlobalLastActivity();
      res.json({ message: "Evento eliminado correctamente" });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res
        .status(500)
        .json({ message: err.message || "Error al borrar evento" });
    } finally {
      client.release();
    }
  },
);

// Actualizar equipos (Solo Admins) - Útil para rellenar eliminatorias
router.put("/:id/teams", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { homeTeamId, awayTeamId, homePlaceholder, awayPlaceholder } = req.body;

  try {
    const query = `
      UPDATE matches 
      SET home_team_id = $1, 
          away_team_id = $2, 
          home_team_placeholder = $3, 
          away_team_placeholder = $4
      WHERE id = $5
      RETURNING id
    `;
    const result = await db.query(query, [
      homeTeamId || null,
      awayTeamId || null,
      homePlaceholder || null,
      awayPlaceholder || null,
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Partido no encontrado" });
    }

    await invalidateMatchCache(id);
    await updateGlobalLastActivity();

    // Auditoría (necesitamos el season_id para el log)
    const matchData = await db.query("SELECT season_id FROM matches WHERE id = $1", [id]);
    const sId = matchData.rows[0]?.season_id;

    await logAction(req.authData.id, "Actualización de equipos", "match", id, {
      homeTeamId,
      awayTeamId,
      homePlaceholder,
      awayPlaceholder,
    }, sId);

    res.json({ message: "Equipos actualizados correctamente", success: true });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Error al actualizar los equipos del partido" });
  }
});

// Finalizar partido
router.put(
  "/:id/finish",
  verifyToken,
  verifyReferee,
  verifyMatchLock,
  async (req, res) => {
    const { id } = req.params;
    const { observations } = req.body;
    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      const matchRes = await client.query(
        `SELECT home_team_id, away_team_id, home_goals, away_goals, status, season_id, group_id FROM matches WHERE id = $1`,
        [id],
      );
      const match = matchRes.rows[0];
      if (match.status === "finalizado")
        throw new Error("El partido ya está finalizado");
      await client.query(
        "UPDATE matches SET status = 'finalizado', observations = $2, locked_by = NULL, locked_at = NULL WHERE id = $1",
        [id, observations || null],
      );
      await client.query(
        `UPDATE player_stats SET matches_played = matches_played + 1 WHERE season_id = $1 AND player_id IN (SELECT player_id FROM match_events WHERE match_id = $2)`,
        [match.season_id, id],
      );

      let hPts = 0,
        aPts = 0,
        hW = 0,
        aW = 0,
        hL = 0,
        aL = 0,
        draw = 0;
      if (match.home_goals > match.away_goals) {
        hPts = 3;
        hW = 1;
        aL = 1;
      } else if (match.home_goals < match.away_goals) {
        aPts = 3;
        aW = 1;
        hL = 1;
      } else {
        hPts = 1;
        aPts = 1;
        draw = 1;
      }

      if (match.group_id && match.home_team_id && match.away_team_id) {
        const upsertSql = `
        INSERT INTO team_stats (team_id, group_id, season_id, played, won, drawn, lost, goals_for, goals_against, points)
        VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (team_id, group_id, season_id) DO UPDATE SET 
        played = team_stats.played + 1, won = team_stats.won + $4, drawn = team_stats.drawn + $5,
        lost = team_stats.lost + $6, goals_for = team_stats.goals_for + $7, goals_against = team_stats.goals_against + $8,
        points = team_stats.points + $9
      `;
        await client.query(upsertSql, [
          match.home_team_id,
          match.group_id,
          match.season_id,
          hW,
          draw,
          hL,
          match.home_goals,
          match.away_goals,
          hPts,
        ]);
        await client.query(upsertSql, [
          match.away_team_id,
          match.group_id,
          match.season_id,
          aW,
          draw,
          aL,
          match.away_goals,
          match.home_goals,
          aPts,
        ]);
      }

      // --- LÓGICA DE PORRA (REPARTO DE PUNTOS) ---
      let matchResult = "empate";
      if (match.home_goals > match.away_goals) matchResult = "local";
      else if (match.home_goals < match.away_goals) matchResult = "visitante";

      // 1. Marcar los votos acertados
      const updateVotesQuery = `
      UPDATE match_votes 
      SET points_awarded = 1 
      WHERE match_id = $1 AND vote = $2 
      RETURNING user_id
    `;
      const correctVotersRes = await client.query(updateVotesQuery, [
        id,
        matchResult,
      ]);
      const correctUserIds = correctVotersRes.rows.map((r) => r.user_id);

      // 2. Sumar el punto a la tabla de puntos por temporada
      if (correctUserIds.length > 0) {
        await client.query(
          `
        INSERT INTO user_points (user_id, season_id, points)
        SELECT id, $2, 1 FROM users WHERE id = ANY($1)
        ON CONFLICT (user_id, season_id) DO UPDATE SET points = user_points.points + 1
      `,
          [correctUserIds, match.season_id],
        );
      }

      await client.query("COMMIT");
      await invalidateMatchCache(id);
      await updateGlobalLastActivity();

      // Auditoría
      await logAction(
        req.authData.id,
        "Finalización de partido",
        "match",
        id,
        {
          homeGoals: match.home_goals,
          awayGoals: match.away_goals,
          season_id: match.season_id,
        },
        match.season_id
      );

      res.json({
        message: "Partido finalizado, clasificación y porra actualizadas",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res
        .status(500)
        .json({ message: err.message || "Error al finalizar partido" });
    } finally {
      client.release();
    }
  },
);

module.exports = router;
