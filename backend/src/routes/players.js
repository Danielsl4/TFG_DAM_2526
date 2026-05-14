const express = require("express");
const router = express.Router();
const db = require("../../db");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");
const { logAction } = require("../utils/logger");
const { deleteImage, getPublicId } = require("../utils/uploader");

// Obtener detalle de un jugador
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const playerResult = await db.query(
      `
      SELECT p.*, t.id as team_id, t.name as team_name, t.logo_url as team_logo
      FROM players p
      LEFT JOIN team_players tp ON p.id = tp.player_id
      LEFT JOIN seasons s ON tp.season_id = s.id AND s.is_active = true
      LEFT JOIN teams t ON tp.team_id = t.id
      WHERE p.id = $1
    `,
      [id],
    );

    if (playerResult.rows.length === 0)
      return res.status(404).json({ message: "Jugador no encontrado" });
    const player = playerResult.rows[0];

    const statsResult = await db.query(
      `
      SELECT sp.* FROM player_stats sp
      JOIN seasons s ON sp.season_id = s.id
      WHERE sp.player_id = $1 AND s.is_active = true
    `,
      [id],
    );

    res.json({ ...player, stats: statsResult.rows[0] || null });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Error al obtener el detalle del jugador" });
  }
});

// Obtener lista de jugadores (con paginación, búsqueda y filtro de temporada)
router.get("/", verifyToken, verifyAdmin, async (req, res) => {
    const { season_id, exclude_season_id, page = 1, limit = 10, search = "" } = req.query;
    const offset = (page - 1) * limit;

    try {
      let query;
      let countQuery;
      let values = [];
      let searchPattern = `%${search}%`;

      if (season_id) {
        countQuery = `
          SELECT COUNT(DISTINCT p.id)
          FROM players p
          JOIN team_players tp ON p.id = tp.player_id
          WHERE tp.season_id = $1 AND unaccent(p.name) ILIKE unaccent($2) AND p.is_active = true
        `;
        query = `
          SELECT p.*, t.name as team_name, tp.jersey_number, tp.team_id
          FROM players p
          JOIN team_players tp ON p.id = tp.player_id
          LEFT JOIN teams t ON tp.team_id = t.id
          WHERE tp.season_id = $1 AND unaccent(p.name) ILIKE unaccent($2) AND p.is_active = true
          ORDER BY LOWER(p.name) ASC
          LIMIT $3 OFFSET $4
        `;
        values = [season_id, searchPattern];
      } else {
        // Búsqueda global, opcionalmente excluyendo una temporada
        let excludeClause = "";
        if (exclude_season_id) {
          excludeClause = `AND NOT EXISTS (SELECT 1 FROM team_players tp2 WHERE tp2.player_id = p.id AND tp2.season_id = $${search ? 2 : 1})`;
        }

        countQuery = `SELECT COUNT(*) FROM players p WHERE unaccent(name) ILIKE unaccent($1) AND is_active = true ${excludeClause}`;
        query = `
          SELECT p.*,
            (SELECT t.name 
             FROM team_players tp 
             JOIN teams t ON tp.team_id = t.id 
             WHERE tp.player_id = p.id 
             ORDER BY tp.season_id DESC 
             LIMIT 1) as last_team
          FROM players p
          WHERE unaccent(p.name) ILIKE unaccent($1) AND p.is_active = true ${excludeClause}
          ORDER BY LOWER(p.name) ASC
          LIMIT $${exclude_season_id ? (search ? 3 : 2) : 2} OFFSET $${exclude_season_id ? (search ? 4 : 3) : 3}
        `;
        
        values = [searchPattern];
        if (exclude_season_id) values.push(exclude_season_id);
      }

    const totalRes = await db.query(countQuery, values);
    const totalPlayers = parseInt(totalRes.rows[0].count);

    // Añadimos limit y offset a los valores de la query principal
    const finalValues = [...values, limit, offset];
    const result = await db.query(query, finalValues);

    res.json({
      players: result.rows,
      pagination: {
        total: totalPlayers,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalPlayers / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener la lista de jugadores" });
  }
});

// --- CRUD DE ADMINISTRACIÓN ---

// Crear un nuevo jugador (Solo Admin)
router.post("/", verifyToken, verifyAdmin, async (req, res) => {
  const { name, birth_date, photo_url, season_id, team_id } = req.body;
  if (!name) return res.status(400).json({ message: "El nombre del jugador es obligatorio" });

  try {
    const query = `INSERT INTO players (name, birth_date, photo_url) VALUES ($1, $2, $3) RETURNING *`;
    const result = await db.query(query, [name, birth_date || null, photo_url || null]);
    const newPlayer = result.rows[0];

    // Si se proporciona una temporada, inscribir al jugador (con o sin equipo)
    if (season_id) {
      await db.query(
        "INSERT INTO team_players (player_id, team_id, season_id) VALUES ($1, $2, $3)",
        [newPlayer.id, team_id || null, season_id]
      );
    }

    await logAction(req.authData.id, 'Creación de jugador', 'player', newPlayer.id, { name: newPlayer.name, season_id, team_id });

    res.status(201).json({ message: "Jugador creado correctamente", player: newPlayer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear el jugador" });
  }
});

// Editar un jugador (Solo Admin)
router.put("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, birth_date, photo_url } = req.body;

  try {
    // 1. Obtener la imagen antigua para borrarla si cambia
    const oldPlayerRes = await db.query("SELECT photo_url FROM players WHERE id = $1", [id]);
    const oldPhotoUrl = oldPlayerRes.rows[0]?.photo_url;

    const query = `UPDATE players SET name = $1, birth_date = $2, photo_url = $3 WHERE id = $4 RETURNING *`;
    const result = await db.query(query, [name, birth_date || null, photo_url, id]);
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Jugador no encontrado" });

    // 2. Si la foto ha cambiado, borrar la antigua SOLO si el public_id es distinto.
    if (oldPhotoUrl && photo_url !== oldPhotoUrl) {
      const oldPublicId = getPublicId(oldPhotoUrl);
      const newPublicId = getPublicId(photo_url);
      
      if (oldPublicId !== newPublicId) {
        await deleteImage(oldPhotoUrl);
      }
    }

    const updatedPlayer = result.rows[0];
    await logAction(req.authData.id, "Actualización de jugador", "player", id, {
      name: updatedPlayer.name,
    });

    res.json({
      message: "Jugador actualizado correctamente",
      player: updatedPlayer,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al actualizar el jugador" });
  }
});

// --- GESTIÓN DE INSCRIPCIONES ---

// Inscribir jugador en un equipo (Solo Admin)
router.post("/:id/register", verifyToken, verifyAdmin, async (req, res) => {
  const { id: playerId } = req.params;
  const { team_id, season_id, jersey_number } = req.body;

  if (!season_id)
    return res
      .status(400)
      .json({ message: "La temporada es obligatoria para inscribir al jugador" });

  try {
    // Validación: Comprobar si el dorsal ya está cogido en este equipo y temporada
    if (jersey_number && team_id) {
      const dorsalCheck = await db.query(
        "SELECT p.name FROM team_players tp JOIN players p ON tp.player_id = p.id WHERE tp.team_id = $1 AND tp.season_id = $2 AND tp.jersey_number = $3 AND tp.player_id != $4",
        [team_id, season_id, jersey_number, playerId],
      );

      if (dorsalCheck.rows.length > 0) {
        return res.status(400).json({
          message: `El dorsal ${jersey_number} ya lo tiene asignado el jugador ${dorsalCheck.rows[0].name}.`,
        });
      }
    }

    // ELIMINAR cualquier inscripción previa del jugador en esta temporada (para evitar duplicados)
    await db.query(
      "DELETE FROM team_players WHERE player_id = $1 AND season_id = $2",
      [playerId, season_id],
    );

    // INSERTAR la nueva inscripción
    const query = `
      INSERT INTO team_players (player_id, team_id, season_id, jersey_number)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    await db.query(query, [
      playerId,
      team_id,
      season_id,
      jersey_number || null,
    ]);

    await logAction(
      req.authData.id,
      "Inscripción de jugador en equipo",
      "player",
      playerId,
      { team_id, season_id, jersey_number },
    );

    res.json({ message: "Jugador inscrito o traspasado correctamente" });
  } catch (err) {
    res.status(500).json({ message: "Error al inscribir al jugador" });
  }
});

// Dar de baja a un jugador de un equipo específico en una temporada (Solo Admin)
router.delete("/:id/unregister", verifyToken, verifyAdmin, async (req, res) => {
  const { id: playerId } = req.params;
  const { team_id, season_id } = req.body;

  if (!team_id || !season_id)
    return res
      .status(400)
      .json({ message: "El equipo y la temporada son obligatorios" });

  try {
    await db.query(
      "DELETE FROM team_players WHERE player_id = $1 AND team_id = $2 AND season_id = $3",
      [playerId, team_id, season_id],
    );
    await logAction(
      req.authData.id,
      "Baja de jugador de equipo",
      "player",
      playerId,
      { team_id, season_id },
    );

    res.json({ message: "Jugador dado de baja del equipo correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al dar de baja al jugador" });
  }
});

// Eliminar a un jugador de una temporada completa (Solo Admin)
// Esto elimina su inscripción en cualquier equipo y sus estadísticas para esa temporada
router.delete(
  "/:id/season/:seasonId",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const { id: playerId, seasonId } = req.params;

    try {
      // 0. Obtener nombre del jugador para el log
      const playerInfo = await db.query("SELECT name FROM players WHERE id = $1", [playerId]);
      const playerName = playerInfo.rows[0]?.name || "Jugador desconocido";

      // 1. Eliminar de team_players (todas sus inscripciones en esa temporada)
      await db.query(
        "DELETE FROM team_players WHERE player_id = $1 AND season_id = $2",
        [playerId, seasonId],
      );

      // 2. Eliminar estadísticas de esa temporada
      await db.query(
        "DELETE FROM player_stats WHERE player_id = $1 AND season_id = $2",
        [playerId, seasonId],
      );

      await logAction(
        req.authData.id,
        "Eliminación de jugador de temporada",
        "player",
        playerId,
        { name: playerName, season_id: seasonId },
      );

      res.json({ message: "Jugador eliminado de la temporada correctamente" });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ message: "Error al eliminar el jugador de la temporada" });
    }
  },
);

// Inscribir un jugador existente en una temporada/equipo (Solo Admin)
router.post("/:id/register", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { team_id, season_id, jersey_number } = req.body;

  if (!season_id)
    return res.status(400).json({ message: "La temporada es obligatoria" });

  try {
    // Evitar duplicados de inscripción en la misma temporada/equipo
    await db.query(
      "DELETE FROM team_players WHERE player_id = $1 AND season_id = $2",
      [id, season_id]
    );

    await db.query(
      "INSERT INTO team_players (player_id, team_id, season_id, jersey_number) VALUES ($1, $2, $3, $4)",
      [id, team_id || null, season_id, jersey_number || null]
    );

    // Auditoría
    await logAction(req.authData.id, 'Inscripción de jugador existente', 'player', id, { team_id, season_id, jersey_number });

    res.status(201).json({ message: "Jugador inscrito correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al inscribir al jugador" });
  }
});

// --- BORRADO LÓGICO Y PAPELERA ---

// Eliminar jugador globalmente (Solo Admin - Borrado Lógico)
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const playerRes = await db.query("SELECT name FROM players WHERE id = $1", [id]);
    if (playerRes.rows.length === 0) return res.status(404).json({ message: "Jugador no encontrado" });
    
    await db.query("UPDATE players SET is_active = false WHERE id = $1", [id]);
    await logAction(req.authData.id, 'Eliminación lógica de jugador', 'player', id, { name: playerRes.rows[0].name });
    
    res.json({ message: "Jugador enviado a la papelera correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar el jugador" });
  }
});

// Obtener jugadores eliminados (Papelera)
router.get("/admin/trash", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM players WHERE is_active = false ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener la papelera de jugadores" });
  }
});

// Restaurar un jugador eliminado
router.post("/:id/restore", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("UPDATE players SET is_active = true WHERE id = $1 RETURNING name", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Jugador no encontrado" });
    
    await logAction(req.authData.id, 'Restauración de jugador', 'player', id, { name: result.rows[0].name });
    res.json({ message: "Jugador restaurado correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al restaurar el jugador" });
  }
});

// El borrado permanente ha sido deshabilitado para preservar el historial y las imágenes de Cloudinary.

module.exports = router;
