const express = require("express");
const router = express.Router();
const db = require("../../db");
const { verifyToken, optionalVerifyToken, verifyAdmin } = require("../middlewares/auth");
const { logAction } = require("../utils/logger");
const { deleteImage, getPublicId } = require("../utils/uploader");

// Obtener lista de todos los equipos (con paginación, búsqueda y filtro opcional por temporada)
router.get("/", async (req, res) => {
  const { season_id, exclude_season_id, page = 1, limit = 10, search = "" } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query;
    let countQuery;
    let values = [];
    let searchPattern = `%${search}%`;

    if (season_id) {
      countQuery = `
        SELECT COUNT(*) 
        FROM teams t
        WHERE unaccent(t.name) ILIKE unaccent($2) AND t.is_active = true AND (
          EXISTS (SELECT 1 FROM team_stats ts WHERE ts.team_id = t.id AND ts.season_id = $1)
          OR 
          EXISTS (SELECT 1 FROM team_players tp WHERE tp.team_id = t.id AND tp.season_id = $1)
        )
      `;
      query = `
        SELECT t.id, t.name, t.logo_url, t.kit_color, t.delegate, t.coach, t.phone
        FROM teams t
        WHERE unaccent(t.name) ILIKE unaccent($2) AND t.is_active = true AND (
          EXISTS (SELECT 1 FROM team_stats ts WHERE ts.team_id = t.id AND ts.season_id = $1)
          OR 
          EXISTS (SELECT 1 FROM team_players tp WHERE tp.team_id = t.id AND tp.season_id = $1)
        )
        ORDER BY LOWER(t.name) ASC
        LIMIT $3 OFFSET $4
      `;
      values = [season_id, searchPattern];
    } else {
      // Búsqueda global con exclusión opcional
      let excludeClause = "";
      if (exclude_season_id) {
        excludeClause = `AND NOT EXISTS (SELECT 1 FROM team_stats ts2 WHERE ts2.team_id = t.id AND ts2.season_id = $${search ? 2 : 1})`;
      }

      countQuery = `SELECT COUNT(*) FROM teams t WHERE unaccent(name) ILIKE unaccent($1) AND is_active = true ${excludeClause}`;
      query = `
        SELECT id, name, logo_url, kit_color, delegate, coach, phone 
        FROM teams t 
        WHERE unaccent(name) ILIKE unaccent($1) AND is_active = true ${excludeClause}
        ORDER BY LOWER(name) ASC 
        LIMIT $${exclude_season_id ? (search ? 3 : 2) : 2} OFFSET $${exclude_season_id ? (search ? 4 : 3) : 3}
      `;
      values = [searchPattern];
      if (exclude_season_id) values.push(exclude_season_id);
    }

    const totalRes = await db.query(countQuery, values);
    const totalTeams = parseInt(totalRes.rows[0].count);

    const finalValues = [...values, limit, offset];
    const result = await db.query(query, finalValues);

    res.json({
      teams: result.rows,
      pagination: {
        total: totalTeams,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalTeams / limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener la lista de equipos" });
  }
});

// Obtener detalle de un equipo
router.get("/:id", optionalVerifyToken, async (req, res) => {
  const { id } = req.params;
  const { season_id } = req.query;
  const userId = req.authData ? req.authData.id : null;
  try {
    const teamResult = await db.query("SELECT * FROM teams WHERE id = $1", [id]);
    if (teamResult.rows.length === 0) return res.status(404).json({ message: "Equipo no encontrado" });
    const team = teamResult.rows[0];

    let isFollowing = false;
    if (userId) {
      const followCheck = await db.query("SELECT 1 FROM team_followers WHERE user_id = $1 AND team_id = $2", [userId, id]);
      isFollowing = followCheck.rows.length > 0;
    }

    // Filtro de temporada: si no viene season_id, usamos la activa
    let seasonFilter = season_id ? "s.id = $2" : "s.is_active = true";
    let params = season_id ? [id, season_id] : [id];

    const playersQuery = `
      SELECT p.id, p.name, p.photo_url, tp.jersey_number, COALESCE(ps.goals, 0) as goals
      FROM players p JOIN team_players tp ON p.id = tp.player_id
      JOIN seasons s ON tp.season_id = s.id
      LEFT JOIN player_stats ps ON p.id = ps.player_id AND ps.season_id = s.id
      WHERE tp.team_id = $1 AND ${seasonFilter}
      ORDER BY 
        CASE 
          WHEN tp.jersey_number ~ '^[0-9]+$' THEN tp.jersey_number::integer 
          ELSE 999 
        END ASC, 
        tp.jersey_number ASC NULLS LAST
    `;
    const playersResult = await db.query(playersQuery, params);

    const statsQuery = `
      SELECT ts.*, g.name as group_name FROM team_stats ts
      JOIN seasons s ON ts.season_id = s.id LEFT JOIN groups g ON ts.group_id = g.id
      WHERE ts.team_id = $1 AND ${seasonFilter}
    `;
    const statsResult = await db.query(statsQuery, params);

    const matchesQuery = `
      SELECT m.id, m.date, m.home_goals, m.away_goals, m.status, m.home_team_placeholder, m.away_team_placeholder,
             t1.id as home_team_id, t1.name as home_team_name, t1.logo_url as home_team_logo,
             t2.id as away_team_id, t2.name as away_team_name, t2.logo_url as away_team_logo,
             f.id as field_id, f.name as field_name, f.location as field_location,
             TO_CHAR(m.date, 'YYYY-MM-DD"T"HH24:MI:SS') as date_iso
      FROM matches m LEFT JOIN teams t1 ON m.home_team_id = t1.id
      LEFT JOIN teams t2 ON m.away_team_id = t2.id LEFT JOIN fields f ON m.field_id = f.id
      JOIN seasons s ON m.season_id = s.id WHERE (m.home_team_id = $1 OR m.away_team_id = $1) AND ${seasonFilter}
      ORDER BY m.date ASC, m.id ASC
    `;
    const matchesResult = await db.query(matchesQuery, params);

    const formattedMatches = matchesResult.rows.map((row) => ({
      id: row.id, date: row.date_iso, status: row.status,
      homeTeam: row.home_team_id ? { id: row.home_team_id, name: row.home_team_name, logoUrl: row.home_team_logo } : null,
      awayTeam: row.away_team_id ? { id: row.away_team_id, name: row.away_team_name, logoUrl: row.away_team_logo } : null,
      homeTeamPlaceholder: row.home_team_placeholder, awayTeamPlaceholder: row.away_team_placeholder,
      homeGoals: row.home_goals, awayGoals: row.away_goals,
      field: row.field_id ? { id: row.field_id, name: row.field_name, location: row.field_location } : null,
    }));

    res.json({
      ...team, isFollowing, players: playersResult.rows, stats: statsResult.rows[0] || null,
      matches: formattedMatches, upcomingMatches: formattedMatches.filter(m => m.status === "pendiente" || !m.status)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener el detalle del equipo" });
  }
});

// --- CRUD DE ADMINISTRACIÓN ---

// Crear un nuevo equipo (Solo Admin)
router.post("/", verifyToken, verifyAdmin, async (req, res) => {
  const { name, kit_color, logo_url, delegate, coach, phone, season_id } = req.body;
  
  if (!name) return res.status(400).json({ message: "El nombre del equipo es obligatorio" });

  try {
    const query = `
      INSERT INTO teams (name, kit_color, logo_url, delegate, coach, phone)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await db.query(query, [name, kit_color || null, logo_url || null, delegate || null, coach || null, phone || null]);
    const newTeam = result.rows[0];

    // Si se proporciona temporada, vincularlo inmediatamente creando sus stats para ese año
    if (season_id) {
      await db.query(
        "INSERT INTO team_stats (team_id, season_id) VALUES ($1, $2)",
        [newTeam.id, season_id]
      );
    }

    await logAction(req.authData.id, 'Creación de equipo', 'team', newTeam.id, { name: newTeam.name, season_id });

    res.status(201).json({ message: "Equipo creado correctamente", team: newTeam });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear el equipo" });
  }
});

// Editar un equipo existente (Solo Admin)
router.put("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, kit_color, logo_url, delegate, coach, phone } = req.body;

  try {
    // 1. Obtener el logo antiguo para borrarlo si cambia
    const oldTeamRes = await db.query("SELECT logo_url FROM teams WHERE id = $1", [id]);
    const oldLogoUrl = oldTeamRes.rows[0]?.logo_url;

    const query = `
      UPDATE teams 
      SET name = $1, kit_color = $2, logo_url = $3, delegate = $4, coach = $5, phone = $6
      WHERE id = $7
      RETURNING *
    `;
    const result = await db.query(query, [name, kit_color, logo_url, delegate, coach, phone, id]);
    
    if (result.rows.length === 0) return res.status(404).json({ message: "Equipo no encontrado" });

    // 2. Si el logo ha cambiado, borrar el antiguo SOLO si el public_id es distinto.
    // Si el public_id es igual, Cloudinary ya lo ha sobrescrito y no debemos borrarlo.
    if (oldLogoUrl && logo_url !== oldLogoUrl) {
      const oldPublicId = getPublicId(oldLogoUrl);
      const newPublicId = getPublicId(logo_url);
      
      if (oldPublicId !== newPublicId) {
        await deleteImage(oldLogoUrl);
      }
    }

    const updatedTeam = result.rows[0];
    await logAction(req.authData.id, 'Actualización de equipo', 'team', id, { name: updatedTeam.name });

    res.json({ message: "Equipo actualizado correctamente", team: updatedTeam });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al actualizar el equipo" });
  }
});

// Eliminar un equipo (Solo Admin) - AHORA CON BORRADO LÓGICO (SOFT DELETE)
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Obtenemos el nombre antes de marcarlo como borrado para el log
    const teamRes = await db.query("SELECT name FROM teams WHERE id = $1", [id]);
    if (teamRes.rows.length === 0) return res.status(404).json({ message: "Equipo no encontrado" });
    const teamName = teamRes.rows[0].name;

    // Marcamos como inactivo en lugar de borrar físicamente
    await db.query("UPDATE teams SET is_active = false WHERE id = $1", [id]);
    
    await logAction(req.authData.id, 'Eliminación lógica de equipo', 'team', id, { name: teamName });

    res.json({ message: "Equipo enviado a la papelera correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar el equipo" });
  }
});

// Eliminar un equipo de una temporada específica (Solo Admin)
router.delete("/:id/season/:seasonId", verifyToken, verifyAdmin, async (req, res) => {
  const { id: teamId, seasonId } = req.params;

  try {
    // 0. Obtener nombre del equipo para el log
    const teamInfo = await db.query("SELECT name FROM teams WHERE id = $1", [teamId]);
    const teamName = teamInfo.rows[0]?.name || "Equipo desconocido";

    // 1. Eliminar estadísticas de esa temporada
    await db.query(
      "DELETE FROM team_stats WHERE team_id = $1 AND season_id = $2",
      [teamId, seasonId]
    );

    // 2. Desvincular a los jugadores del equipo en esta temporada (pero mantenerlos en la temporada)
    await db.query(
      "UPDATE team_players SET team_id = NULL WHERE team_id = $1 AND season_id = $2",
      [teamId, seasonId]
    );

    await logAction(
      req.authData.id,
      "Eliminación de equipo de temporada",
      "team",
      teamId,
      { name: teamName, season_id: seasonId }
    );

    res.json({ message: "Equipo eliminado de la temporada correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar el equipo de la temporada" });
  }
});

// Obtener equipos eliminados (Papelera)
router.get("/admin/trash", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM teams WHERE is_active = false ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener la papelera" });
  }
});

// Obtener reporte masivo de equipos para la temporada (Equipos + Jugadores)
router.get("/admin/report", verifyToken, verifyAdmin, async (req, res) => {
  const { season_id } = req.query;
  
  if (!season_id) {
    return res.status(400).json({ message: "La temporada es obligatoria para el reporte." });
  }

  try {
    // Buscar equipos que tengan jugadores o estadísticas en esta temporada
    const teamsQuery = `
      SELECT t.id, t.name, t.delegate, t.coach, t.phone
      FROM teams t
      WHERE t.is_active = true AND (
        EXISTS (SELECT 1 FROM team_stats ts WHERE ts.team_id = t.id AND ts.season_id = $1)
        OR 
        EXISTS (SELECT 1 FROM team_players tp WHERE tp.team_id = t.id AND tp.season_id = $1)
      )
      ORDER BY LOWER(t.name) ASC
    `;
    const teamsResult = await db.query(teamsQuery, [season_id]);
    const teams = teamsResult.rows;

    if (teams.length > 0) {
      const teamIds = teams.map(t => t.id);
      
      const playersQuery = `
        SELECT tp.team_id, p.id, p.name, tp.jersey_number, p.birth_date
        FROM players p
        JOIN team_players tp ON p.id = tp.player_id
        WHERE tp.season_id = $1 AND tp.team_id = ANY($2)
        ORDER BY 
          CASE WHEN tp.jersey_number ~ '^[0-9]+$' THEN tp.jersey_number::integer ELSE 999 END ASC, 
          tp.jersey_number ASC NULLS LAST
      `;
      const playersResult = await db.query(playersQuery, [season_id, teamIds]);
      const players = playersResult.rows;

      teams.forEach(t => {
        t.players = players.filter(p => p.team_id === t.id);
      });
    }

    res.json(teams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al generar el reporte de equipos" });
  }
});

// Restaurar un equipo eliminado
router.post("/:id/restore", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("UPDATE teams SET is_active = true WHERE id = $1 RETURNING name", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Equipo no encontrado" });
    
    await logAction(req.authData.id, 'Restauración de equipo', 'team', id, { name: result.rows[0].name });
    
    res.json({ message: "Equipo restaurado correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al restaurar el equipo" });
  }
});

// El borrado permanente ha sido deshabilitado para preservar el historial y los logos de Cloudinary.

// Seguir/Dejar de seguir equipo
router.post("/:id/toggle-follow", verifyToken, async (req, res) => {
  const { id: teamId } = req.params;
  const userId = req.authData.id;
  try {
    const check = await db.query("SELECT 1 FROM team_followers WHERE user_id = $1 AND team_id = $2", [userId, teamId]);
    if (check.rows.length > 0) {
      await db.query("DELETE FROM team_followers WHERE user_id = $1 AND team_id = $2", [userId, teamId]);
      return res.json({ message: "Has dejado de seguir al equipo", isFollowing: false });
    } else {
      await db.query("INSERT INTO team_followers (user_id, team_id) VALUES ($1, $2)", [userId, teamId]);
      return res.json({ message: "Ahora sigues al equipo", isFollowing: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al cambiar el estado de seguimiento" });
  }
});

// Obtener los jugadores de un equipo para una temporada específica
router.get("/:id/players", async (req, res) => {
  const { id } = req.params;
  const { season_id } = req.query;

  if (!season_id) return res.status(400).json({ message: "La temporada es obligatoria" });

  try {
    const query = `
      SELECT p.id, p.name, p.photo_url, tp.jersey_number
      FROM players p
      JOIN team_players tp ON p.id = tp.player_id
      WHERE tp.team_id = $1 AND tp.season_id = $2
      ORDER BY 
        CASE 
          WHEN tp.jersey_number ~ '^[0-9]+$' THEN tp.jersey_number::integer 
          ELSE 999 
        END ASC, 
        tp.jersey_number ASC NULLS LAST, 
        LOWER(p.name) ASC
    `;
    const result = await db.query(query, [id, season_id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener jugadores del equipo" });
  }
});

// Inscribir un equipo existente en una temporada (Solo Admin)
router.post("/:id/register", verifyToken, verifyAdmin, async (req, res) => {
  const { id: teamId } = req.params;
  const { season_id } = req.body;

  if (!season_id) return res.status(400).json({ message: "La temporada es obligatoria" });

  try {
    // Evitar duplicados
    await db.query("DELETE FROM team_stats WHERE team_id = $1 AND season_id = $2", [teamId, season_id]);
    
    await db.query(
      "INSERT INTO team_stats (team_id, season_id) VALUES ($1, $2)",
      [teamId, season_id]
    );

    // Auditoría
    await logAction(req.authData.id, 'Inscripción de equipo existente', 'team', teamId, { season_id });

    res.status(201).json({ message: "Equipo inscrito correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al inscribir al equipo" });
  }
});

module.exports = router;
