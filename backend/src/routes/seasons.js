const express = require("express");
const router = express.Router();
const db = require("../../db");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");
const { logAction } = require("../utils/logger");

// Obtener todas las temporadas
router.get("/", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM seasons ORDER BY start_date DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener las temporadas" });
  }
});

// Obtener la temporada activa
router.get("/active", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM seasons WHERE is_active = true LIMIT 1");
    if (result.rows.length === 0) return res.status(404).json({ message: "No hay temporada activa" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener la temporada activa" });
  }
});

// --- ADMIN ---

// Crear temporada (con importación opcional atómica)
router.post("/", verifyToken, verifyAdmin, async (req, res) => {
  const { name, start_date, end_date, is_active, import_from } = req.body;
  if (!name) return res.status(400).json({ message: "El nombre es obligatorio" });

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    if (is_active) {
      await client.query("UPDATE seasons SET is_active = false");
    }

    const query = `
      INSERT INTO seasons (name, start_date, end_date, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await client.query(query, [name, start_date, end_date, is_active || false]);
    const newSeason = result.rows[0];

    // Si se solicita importar, hacerlo dentro de la misma transacción
    if (import_from && import_from !== "") {
      const fromId = parseInt(import_from);

      // 1. Grupos
      await client.query(`
        INSERT INTO groups (name, season_id)
        SELECT name, $1::int FROM groups WHERE season_id = $2::int
        RETURNING id
      `, [newSeason.id, fromId]);

      // 2. Equipos (Estadísticas a 0)
      await client.query(`
        INSERT INTO team_stats (team_id, season_id)
        SELECT DISTINCT team_id, $1::int FROM team_stats WHERE season_id = $2::int
        ON CONFLICT DO NOTHING
      `, [newSeason.id, fromId]);

      // 3. Jugadores
      await client.query(`
        INSERT INTO team_players (player_id, team_id, season_id, jersey_number)
        SELECT player_id, team_id, $1::int, jersey_number FROM team_players WHERE season_id = $2::int
        ON CONFLICT DO NOTHING
      `, [newSeason.id, fromId]);
    }

    await client.query("COMMIT");

    await logAction(req.authData.id, 'Creación de temporada', 'season', newSeason.id, { 
      name: newSeason.name, 
      imported_from: import_from || null 
    }, newSeason.id);

    res.status(201).json(newSeason);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Error al crear la temporada y procesar la importación." });
  } finally {
    client.release();
  }
});

// Editar temporada
router.put("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, start_date, end_date, is_active } = req.body;

  try {
    if (is_active) {
      await db.query("UPDATE seasons SET is_active = false WHERE id != $1", [id]);
    }

    const query = `
      UPDATE seasons 
      SET name = $1, start_date = $2, end_date = $3, is_active = $4
      WHERE id = $5
      RETURNING *
    `;
    const result = await db.query(query, [name, start_date, end_date, is_active, id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Temporada no encontrada" });

    const updatedSeason = result.rows[0];
    await logAction(req.authData.id, 'Actualización de temporada', 'season', id, { name: updatedSeason.name }, id);
    res.json(updatedSeason);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al actualizar la temporada" });
  }
});

// Eliminar temporada
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const seasonRes = await db.query("SELECT name FROM seasons WHERE id = $1", [id]);
    if (seasonRes.rows.length === 0) return res.status(404).json({ message: "Temporada no encontrada" });
    const seasonName = seasonRes.rows[0].name;

    await db.query("DELETE FROM seasons WHERE id = $1", [id]);
    await logAction(req.authData.id, 'Eliminación de temporada', 'season', id, { name: seasonName }, id);
    res.json({ message: "Temporada eliminada correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar la temporada. Asegúrate de que no tenga dependencias (grupos, partidos)." });
  }
});

// Importar estructura de otra temporada (Grupos + Plantillas, sin asignar equipos a grupos)
router.post("/:id/import-structure", verifyToken, verifyAdmin, async (req, res) => {
  const { id: newSeasonId } = req.params;
  const { fromSeasonId } = req.body;

  if (!fromSeasonId) {
    return res.status(400).json({ message: "Se requiere el ID de la temporada origen" });
  }

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    const groupsCloneQuery = `
      INSERT INTO groups (name, season_id)
      SELECT name, $1 FROM groups 
      WHERE season_id = $2
      RETURNING id, name
    `;
    const groupsResult = await client.query(groupsCloneQuery, [parseInt(newSeasonId), parseInt(fromSeasonId)]);
    
    // 2. Clonar los Equipos (Crear sus estadísticas a 0 para el nuevo año)
    const teamsCloneQuery = `
      INSERT INTO team_stats (team_id, season_id)
      SELECT DISTINCT team_id, $1 
      FROM team_stats 
      WHERE season_id = $2
      ON CONFLICT (team_id, season_id) DO NOTHING
    `;
    await client.query(teamsCloneQuery, [parseInt(newSeasonId), parseInt(fromSeasonId)]);

    // 3. Clonar las Plantillas de los Jugadores (Inscribirlos en sus equipos para el nuevo año)
    const playersCloneQuery = `
      INSERT INTO team_players (player_id, team_id, season_id, jersey_number)
      SELECT player_id, team_id, $1, jersey_number
      FROM team_players
      WHERE season_id = $2
      ON CONFLICT DO NOTHING
    `;
    await client.query(playersCloneQuery, [parseInt(newSeasonId), parseInt(fromSeasonId)]);

    await client.query("COMMIT");

    // Auditoría
    await logAction(req.authData.id, 'Importación de estructura de temporada', 'season', newSeasonId, { 
      fromSeasonId, 
      mode: 'grupos_equipos_y_plantillas'
    }, newSeasonId);

    res.json({ 
      message: "Grupos y plantillas importados. Los equipos están listos para ser asignados a grupos.", 
      groupsImported: groupsResult.rows.length 
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Error al importar la estructura" });
  } finally {
    client.release();
  }
});

module.exports = router;
