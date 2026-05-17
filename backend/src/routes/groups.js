const express = require("express");
const router = express.Router();
const db = require("../../db");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");
const { logAction } = require("../utils/logger");

// Obtener todos los grupos
router.get("/", async (req, res) => {
  const { season_id } = req.query;
  try {
    let query = "SELECT g.*, s.name as season_name FROM groups g JOIN seasons s ON g.season_id = s.id";
    let params = [];

    if (season_id) {
      query += " WHERE g.season_id = $1";
      params.push(season_id);
    }

    query += " ORDER BY s.start_date DESC, LOWER(g.name) ASC";
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener los grupos" });
  }
});

// --- ADMIN ---

// Crear grupo
router.post("/", verifyToken, verifyAdmin, async (req, res) => {
  const { name, season_id } = req.body;
  if (!name || !season_id) return res.status(400).json({ message: "Nombre y ID de temporada son obligatorios" });

  try {
    const query = "INSERT INTO groups (name, season_id) VALUES ($1, $2) RETURNING *";
    const result = await db.query(query, [name, season_id]);
    const newGroup = result.rows[0];

    await logAction(req.authData.id, 'Creación de grupo', 'group', newGroup.id, { name: newGroup.name }, season_id);
    res.status(201).json(newGroup);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear el grupo" });
  }
});

// Editar grupo
router.put("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, season_id } = req.body;

  try {
    const query = "UPDATE groups SET name = $1, season_id = $2 WHERE id = $3 RETURNING *";
    const result = await db.query(query, [name, season_id, id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Grupo no encontrado" });

    const updatedGroup = result.rows[0];
    await logAction(req.authData.id, 'Actualización de grupo', 'group', id, { name: updatedGroup.name }, season_id);
    res.json(updatedGroup);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al actualizar el grupo" });
  }
});

// Eliminar grupo
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const groupRes = await db.query("SELECT name, season_id FROM groups WHERE id = $1", [id]);
    if (groupRes.rows.length === 0) return res.status(404).json({ message: "Grupo no encontrado" });
    const { name: groupName, season_id: sId } = groupRes.rows[0];

    await db.query("DELETE FROM groups WHERE id = $1", [id]);
    await logAction(req.authData.id, 'Eliminación de grupo', 'group', id, { name: groupName }, sId);
    res.json({ message: "Grupo eliminado correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar el grupo. Comprueba que no tenga partidos asociados." });
  }
});

// --- GESTIÓN DE EQUIPOS EN GRUPOS ---

// Obtener equipos de un grupo
router.get("/:id/teams", async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT t.id, t.name, t.logo_url, ts.played, ts.points
      FROM teams t
      JOIN team_stats ts ON t.id = ts.team_id
      WHERE ts.group_id = $1
      ORDER BY ts.points DESC, ts.goals_for DESC, LOWER(t.name) ASC
    `;
    const result = await db.query(query, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener los equipos del grupo" });
  }
});

// Asignar un equipo a un grupo (Crea registro en team_stats)
router.post("/:id/teams", verifyToken, verifyAdmin, async (req, res) => {
  const { id: groupId } = req.params;
  const { team_id, season_id } = req.body;

  if (!team_id || !season_id) return res.status(400).json({ message: "Team ID y Season ID son obligatorios" });

  try {
    // Comprobar si ya existe
    const check = await db.query("SELECT 1 FROM team_stats WHERE team_id = $1 AND group_id = $2 AND season_id = $3", [team_id, groupId, season_id]);
    if (check.rows.length > 0) return res.status(400).json({ message: "El equipo ya está en este grupo" });

    const query = `
      INSERT INTO team_stats (team_id, group_id, season_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await db.query(query, [team_id, groupId, season_id]);
    
    await logAction(req.authData.id, 'Asignación de equipo a grupo', 'group', groupId, { team_id }, season_id);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al asignar el equipo al grupo" });
  }
});

// Eliminar un equipo de un grupo
router.delete("/:id/teams/:teamId", verifyToken, verifyAdmin, async (req, res) => {
  const { id: groupId, teamId } = req.params;
  const { season_id } = req.query; // Necesitamos el season_id para el borrado preciso

  if (!season_id) return res.status(400).json({ message: "Season ID es obligatorio (pásalo como query param)" });

  try {
    await db.query("DELETE FROM team_stats WHERE team_id = $1 AND group_id = $2 AND season_id = $3", [teamId, groupId, season_id]);
    
    await logAction(req.authData.id, 'Eliminación de equipo de grupo', 'group', groupId, { team_id: teamId }, season_id);
    res.json({ message: "Equipo eliminado del grupo" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar el equipo del grupo" });
  }
});

module.exports = router;
