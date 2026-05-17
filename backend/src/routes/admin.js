const express = require("express");
const router = express.Router();
const db = require("../../db");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");
const { logAction } = require("../utils/logger");

router.get("/active-season", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM seasons WHERE is_active = true LIMIT 1",
    );
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ message: "No hay ninguna temporada activa" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener la temporada activa" });
  }
});

/**
 * Resumen general de la liga para el dashboard de administración.
 * Devuelve conteos de entidades y los logs de auditoría más recientes.
 */
router.get("/summary", verifyToken, verifyAdmin, async (req, res) => {
  const { season_id } = req.query;

  try {
    let teamsCountQuery = "SELECT COUNT(*) FROM teams";
    let playersCountQuery = "SELECT COUNT(*) FROM players";
    let pendingMatchesQuery =
      "SELECT COUNT(*) FROM matches WHERE status = 'pendiente'";
    let values = [];

    if (season_id) {
      // Filtrar por temporada específica
      teamsCountQuery = `
        SELECT COUNT(DISTINCT t.id) FROM teams t
        LEFT JOIN team_stats ts ON t.id = ts.team_id AND ts.season_id = $1
        LEFT JOIN team_players tp ON t.id = tp.team_id AND tp.season_id = $1
        WHERE ts.season_id IS NOT NULL OR tp.season_id IS NOT NULL
      `;
      playersCountQuery =
        "SELECT COUNT(DISTINCT player_id) FROM team_players WHERE season_id = $1";
      pendingMatchesQuery =
        "SELECT COUNT(*) FROM matches WHERE status = 'pendiente' AND season_id = $1";
      values = [season_id];
    }

    const teamsRes = await db.query(teamsCountQuery, values);
    const playersRes = await db.query(playersCountQuery, values);
    const pendingRes = await db.query(pendingMatchesQuery, values);
    const usersRes = await db.query("SELECT COUNT(*) FROM users");

    // Obtenemos los últimos 5 logs de auditoría (filtrados por temporada si se proporciona, o globales)
    const recentLogs = await db.query(
      `
      SELECT al.*, u.username 
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE ($1::integer IS NULL) 
         OR (al.season_id = $1::integer OR al.season_id IS NULL)
      ORDER BY al.created_at DESC 
      LIMIT 5
    `,
      [season_id && season_id !== 'null' && season_id !== '' ? parseInt(season_id) : null],
    );

    res.json({
      stats: {
        totalTeams: parseInt(teamsRes.rows[0].count),
        totalPlayers: parseInt(playersRes.rows[0].count),
        pendingMatches: parseInt(pendingRes.rows[0].count),
        totalUsers: parseInt(usersRes.rows[0].count),
      },
      recentActivity: recentLogs.rows,
    });
  } catch (err) {
    console.error("Error en admin/summary:", err);
    res
      .status(500)
      .json({ message: "Error al obtener el resumen administrativo" });
  }
});

/**
 * Sube una imagen a Cloudinary (optimizada con Sharp).
 * Se espera un campo 'image' en el multipart/form-data.
 * Opcionalmente se puede pasar ?folder=nombre_carpeta
 */
const { upload, uploadImage } = require("../utils/uploader");

router.post(
  "/upload",
  verifyToken,
  verifyAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "No se ha proporcionado ninguna imagen" });
    }

    const folder = req.query.folder || "general";
    const filename = req.query.filename || null;

    try {
      const imageUrl = await uploadImage(req.file.buffer, folder, filename);
      res.json({ url: imageUrl });
    } catch (err) {
      console.error("Error en el proceso de subida:", err);
      res.status(500).json({ message: "Error al procesar o subir la imagen" });
    }
  },
);

/**
 * Gestión de usuarios (Admin)
 */
router.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let whereClauses = [];
    let values = [];
    let pIdx = 1;

    if (search) {
      whereClauses.push(`(unaccent(u.username) ILIKE unaccent($${pIdx}) OR unaccent(u.email) ILIKE unaccent($${pIdx}))`);
      values.push(`%${search}%`);
      pIdx++;
    }

    whereClauses.push(`u.is_active = true`);

    const whereSql =
      whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

    let query = `
      SELECT u.id, u.username, u.email, u.role, u.is_verified, u.verification_token, u.created_at
      FROM users u
      ${whereSql}
      ORDER BY u.created_at DESC 
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    let countQuery = `SELECT COUNT(*) FROM users u ${whereSql}`;

    const result = await db.query(query, [...values, limit, offset]);
    const totalRes = await db.query(countQuery, values);

    res.json({
      users: result.rows,
      total: parseInt(totalRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error("Error en admin/users (GET):", err);
    res.status(500).json({ message: "Error al obtener usuarios" });
  }
});

router.put("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  try {
    // 1. Actualizar rol en tabla users
    const result = await db.query(
      "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role",
      [role, id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    const updatedUser = result.rows[0];

    // Auditoría
    await logAction(req.authData.id, "Actualización de usuario", "user", id, {
      name: updatedUser.username,
      role: updatedUser.role,
    });

    res.json({
      message: "Usuario actualizado correctamente",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Error en admin/users (PUT):", err);
    res.status(500).json({ message: "Error al actualizar usuario" });
  }
});

router.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.authData.id;

  try {
    const userRes = await db.query("SELECT username, email, is_active FROM users WHERE id = $1", [id]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    
    const user = userRes.rows[0];
    if (!user.is_active) return res.status(400).json({ message: "La cuenta ya está desactivada" });

    const timestamp = Date.now();
    const anonymizedUsername = `${user.username}__deleted__${timestamp}`;
    const anonymizedEmail = `${user.email}__deleted__${timestamp}`;

    await db.query(
      "UPDATE users SET is_active = false, username = $1, email = $2 WHERE id = $3",
      [anonymizedUsername, anonymizedEmail, id]
    );

    await logAction(adminId, "Desactivación de usuario (Admin)", "user", id, {
      name: user.username,
    });

    res.json({ message: "Usuario desactivado y anonimizado correctamente" });
  } catch (err) {
    console.error("Error en admin/users (DELETE):", err);
    res.status(500).json({ message: "Error al desactivar usuario" });
  }
});

router.post("/users/:id/verify", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.authData.id;

  try {
    const userRes = await db.query("SELECT username, is_verified FROM users WHERE id = $1", [id]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });

    const user = userRes.rows[0];
    if (user.is_verified) {
      return res.status(400).json({ message: "El usuario ya está verificado" });
    }

    await db.query(
      "UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = $1",
      [id]
    );

    await logAction(adminId, "Verificación manual de usuario (Admin)", "user", id, {
      name: user.username,
    });

    res.json({ message: "Usuario verificado manualmente con éxito" });
  } catch (err) {
    console.error("Error al verificar usuario:", err);
    res.status(500).json({ message: "Error al verificar usuario" });
  }
});

/**
 * Listado de logs de auditoría (Admin)
 */
router.get("/logs", verifyToken, verifyAdmin, async (req, res) => {
  const { page = 1, limit = 20, season_id, username, date } = req.query;
  const offset = (page - 1) * limit;

  try {
    let whereClauses = [];
    let filterValues = [];
    let pIdx = 1;

    // Filtro de temporada (opcional)
    if (season_id && season_id !== 'null' && season_id !== '') {
      const sId = parseInt(season_id);
      whereClauses.push(
        `(al.season_id = $${pIdx}::integer OR al.season_id IS NULL)`,
      );
      filterValues.push(sId);
      pIdx++;
    }

    if (username) {
      whereClauses.push(`unaccent(u.username) ILIKE unaccent($${pIdx})`);
      filterValues.push(`%${username}%`);
      pIdx++;
    }

    if (date) {
      whereClauses.push(`al.created_at::date = $${pIdx}`);
      filterValues.push(date);
      pIdx++;
    }

    const whereSql =
      whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

    const query = `
      SELECT al.*, u.username 
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereSql}
      ORDER BY al.created_at DESC 
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) 
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereSql}
    `;

    const result = await db.query(query, [...filterValues, limit, offset]);
    const totalRes = await db.query(countQuery, filterValues);

    res.json({
      logs: result.rows,
      total: parseInt(totalRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error("Error en admin/logs:", err);
    res.status(500).json({ message: "Error al obtener los logs" });
  }
});

module.exports = router;
