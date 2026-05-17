const express = require("express");
const router = express.Router();
const db = require("../../db");
const { verifyToken } = require("../middlewares/auth");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

// Lista de usuarios básicos (requiere login)
router.get("/users", verifyToken, async (req, res) => {
  try {
    const result = await db.query("SELECT id, username FROM users");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching users" });
  }
});

// Perfil completo del usuario logueado
router.get("/user/profile", verifyToken, async (req, res) => {
  const userId = req.authData.id;

  try {
    // 1. Datos básicos del usuario
    const userRes = await db.query("SELECT id, username, email, recovery_key FROM users WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    const user = userRes.rows[0];

    // 2. Equipos seguidos
    const followsRes = await db.query(`
      SELECT t.id, t.name, t.logo_url 
      FROM teams t
      JOIN team_followers tf ON t.id = tf.team_id
      WHERE tf.user_id = $1
    `, [userId]);
    const followedTeams = followsRes.rows;

    // 3. Próximos partidos de los equipos seguidos (máximo 5)
    let upcomingMatches = [];
    if (followedTeams.length > 0) {
      const teamIds = followedTeams.map(t => t.id);
      const matchesRes = await db.query(`
        SELECT 
            m.id, m.date, m.status, m.phase, m.home_team_placeholder, m.away_team_placeholder,
            t1.name as home_team_name, t1.logo_url as home_team_logo,
            t2.name as away_team_name, t2.logo_url as away_team_logo,
            f.name as field_name, f.location as field_location,
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
        JOIN seasons s ON m.season_id = s.id
        WHERE (m.home_team_id = ANY($1) OR m.away_team_id = ANY($1)) 
          AND s.is_active = true
          AND (m.status = 'pendiente' OR m.status IS NULL)
          AND m.date >= NOW()
        ORDER BY m.date ASC, m.id ASC
        LIMIT 5
      `, [teamIds, userId]);
      
      upcomingMatches = matchesRes.rows.map(row => ({
        id: row.id,
        date: row.date_iso,
        homeTeam: row.home_team_name ? { name: row.home_team_name, logoUrl: row.home_team_logo } : null,
        awayTeam: row.away_team_name ? { name: row.away_team_name, logoUrl: row.away_team_logo } : null,
        homeTeamPlaceholder: row.home_team_placeholder,
        awayTeamPlaceholder: row.away_team_placeholder,
        field: { name: row.field_name, location: row.field_location },
        status: row.status,
        phase: row.phase,
        groupName: row.group_name,
        userVote: row.user_vote,
        votingStats: {
          local: parseInt(row.votes_local) || 0,
          draw: parseInt(row.votes_empate) || 0,
          away: parseInt(row.votes_visitante) || 0,
          total: (parseInt(row.votes_local) || 0) + (parseInt(row.votes_empate) || 0) + (parseInt(row.votes_visitante) || 0)
        }
      }));
    }

    res.json({
      user,
      followedTeams,
      upcomingMatches
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener el perfil" });
  }
});

// Regenerar clave de recuperación (requiere login)
router.post("/user/regenerate-recovery-key", verifyToken, async (req, res) => {
  const userId = req.authData.id;

  try {
    // Generar nueva clave de recuperación
    const newRecoveryKeyPlain = 'REC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const newRecoveryKeyHash = await bcrypt.hash(newRecoveryKeyPlain, 10);

    // Guardar en base de datos
    await db.query(
      "UPDATE users SET recovery_key = $1 WHERE id = $2",
      [newRecoveryKeyHash, userId]
    );

    // Registrar acción en auditoría
    await db.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [userId, "Regeneración de clave de recuperación de emergencia", "user", userId, {}]
    );

    res.json({
      message: "Nueva clave de recuperación de emergencia generada con éxito.",
      recoveryKey: newRecoveryKeyPlain
    });
  } catch (err) {
    console.error("Error al regenerar clave de recuperación:", err);
    res.status(500).json({ message: "Error al regenerar la clave de recuperación." });
  }
});

// Obtener estadísticas de porra del usuario logueado
router.get("/me/predictor-stats", verifyToken, async (req, res) => {
  const userId = req.authData.id;

  try {
    // 1. Puntos totales y posición en el ranking
    const statsRes = await db.query(`
      WITH user_ranks AS (
        SELECT id, points, RANK() OVER (ORDER BY points DESC, username ASC) as rank
        FROM users 
        WHERE role = 'user'
      )
      SELECT points, rank FROM user_ranks WHERE id = $1
    `, [userId]);

    if (statsRes.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const { points, rank } = statsRes.rows[0];

    // 2. Historial de votos (los últimos 20)
    const votesRes = await db.query(`
      SELECT 
        mv.vote as my_prediction,
        mv.points_awarded,
        m.id as match_id,
        m.home_goals,
        m.away_goals,
        m.status,
        m.date,
        t1.name as home_team_name,
        t2.name as away_team_name,
        CASE 
          WHEN m.status != 'finalizado' THEN 'pendiente'
          WHEN m.home_goals > m.away_goals THEN 'local'
          WHEN m.home_goals < m.away_goals THEN 'visitante'
          ELSE 'empate'
        END as real_result
      FROM match_votes mv
      JOIN matches m ON mv.match_id = m.id
      LEFT JOIN teams t1 ON m.home_team_id = t1.id
      LEFT JOIN teams t2 ON m.away_team_id = t2.id
      WHERE mv.user_id = $1
      ORDER BY m.date DESC
      LIMIT 20
    `, [userId]);

    res.json({
      totalPoints: parseInt(points) || 0,
      globalRank: parseInt(rank) || 0,
      history: votesRes.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener estadísticas de porra" });
  }
});

// Eliminar/Desactivar cuenta de usuario (Anonimización)
router.delete("/user/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const requesterId = req.authData.id;
  const requesterRole = req.authData.role;

  // Solo el propio usuario o un admin pueden desactivar la cuenta
  if (parseInt(id) !== requesterId && requesterRole !== 'admin') {
    return res.status(403).json({ message: "No tienes permiso para desactivar esta cuenta" });
  }

  try {
    const userRes = await db.query("SELECT username, email, is_active FROM users WHERE id = $1", [id]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    
    const user = userRes.rows[0];
    if (!user.is_active) return res.status(400).json({ message: "La cuenta ya está desactivada" });

    const timestamp = Date.now();
    const newUsername = `${user.username}__deleted__${timestamp}`;
    const newEmail = `${user.email}__deleted__${timestamp}`;

    await db.query(
      "UPDATE users SET is_active = false, username = $1, email = $2 WHERE id = $3",
      [newUsername, newEmail, id]
    );

    // Si es el propio usuario el que se borra, registrar log con su ID
    // Si es un admin, registrar que el admin borró al usuario
    const actionMsg = parseInt(id) === requesterId ? "Auto-eliminación de cuenta" : `Admin desactivó cuenta de usuario (ID: ${id})`;
    await db.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)",
      [requesterId, actionMsg, 'user', id, { previous_username: user.username }]
    );

    res.json({ message: "Cuenta desactivada y datos anonimizados correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al desactivar la cuenta" });
  }
});

module.exports = router;
