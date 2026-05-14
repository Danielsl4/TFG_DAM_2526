const express = require("express");
const router = express.Router();
const db = require("../../db");
const { verifyToken } = require("../middlewares/auth");

// Obtener estadísticas globales e individuales
router.get("/", async (req, res) => {
  const { season_id } = req.query;

  try {
    // Si no se pasa season_id, buscamos el ID de la temporada activa
    let seasonCondition = season_id 
      ? "$1" 
      : "(SELECT id FROM seasons WHERE is_active = true LIMIT 1)";
    let params = season_id ? [season_id] : [];

    const globalStatsQuery = `
      SELECT COUNT(*) as matches_played, SUM(home_goals + away_goals) as total_goals,
             ROUND(AVG(home_goals + away_goals), 2) as avg_goals_per_match
      FROM matches WHERE status = 'finalizado' 
      AND season_id = ${seasonCondition}
    `;
    const globalCardsQuery = `
      SELECT SUM(yellow_cards) as total_yellows, SUM(red_cards) as total_reds
      FROM team_stats ts WHERE ts.season_id = ${seasonCondition}
    `;
    const totalCleanSheetsQuery = `
      SELECT COUNT(*) as total_clean_sheets FROM matches 
      WHERE status = 'finalizado' AND (home_goals = 0 OR away_goals = 0)
      AND season_id = ${seasonCondition}
    `;
    const teamRankingsQuery = `
      SELECT t.id, t.name, t.logo_url, ts.won, ts.lost, ts.drawn, ts.goals_for, ts.goals_against
      FROM team_stats ts JOIN teams t ON ts.team_id = t.id
      WHERE ts.season_id = ${seasonCondition}
    `;
    const topScorersQuery = `
      SELECT p.id, p.name, p.photo_url, t.name as team_name, ps.goals as value
      FROM player_stats ps JOIN players p ON ps.player_id = p.id
      JOIN team_players tp ON p.id = tp.player_id AND tp.season_id = ps.season_id
      JOIN teams t ON tp.team_id = t.id 
      WHERE ps.season_id = ${seasonCondition} ORDER BY ps.goals DESC
    `;
    const topYellowsQuery = `
      SELECT p.id, p.name, p.photo_url, t.name as team_name, ps.yellow_cards as value
      FROM player_stats ps JOIN players p ON ps.player_id = p.id
      JOIN team_players tp ON p.id = tp.player_id AND tp.season_id = ps.season_id
      JOIN teams t ON tp.team_id = t.id 
      WHERE ps.season_id = ${seasonCondition} AND ps.yellow_cards > 0 ORDER BY ps.yellow_cards DESC
    `;
    const topRedsQuery = `
      SELECT p.id, p.name, p.photo_url, t.name as team_name, ps.red_cards as value
      FROM player_stats ps JOIN players p ON ps.player_id = p.id
      JOIN team_players tp ON p.id = tp.player_id AND tp.season_id = ps.season_id
      JOIN teams t ON tp.team_id = t.id 
      WHERE ps.season_id = ${seasonCondition} AND ps.red_cards > 0 ORDER BY ps.red_cards DESC
    `;

    const [globalRes, cardsRes, csRes, teamsRes, scorersRes, yellowsRes, redsRes] = await Promise.all([
      db.query(globalStatsQuery, params), db.query(globalCardsQuery, params), db.query(totalCleanSheetsQuery, params),
      db.query(teamRankingsQuery, params), db.query(topScorersQuery, params), db.query(topYellowsQuery, params), db.query(topRedsQuery, params)
    ]);

    const globalData = globalRes.rows[0]; const cardsData = cardsRes.rows[0]; const teams = teamsRes.rows;
    res.json({
      global: {
        matchesPlayed: parseInt(globalData.matches_played) || 0, totalGoals: parseInt(globalData.total_goals) || 0,
        avgGoals: parseFloat(globalData.avg_goals_per_match) || 0, totalYellows: parseInt(cardsData.total_yellows) || 0,
        totalReds: parseInt(cardsData.total_reds) || 0, totalCleanSheets: parseInt(csRes.rows[0].total_clean_sheets) || 0
      },
      teamRankings: {
        mostWins: [...teams].sort((a, b) => b.won - a.won).slice(0, 5),
        mostLosses: [...teams].sort((a, b) => b.lost - a.lost).slice(0, 5),
        mostDraws: [...teams].sort((a, b) => b.drawn - a.drawn).slice(0, 5),
        bestOffense: [...teams].sort((a, b) => b.goals_for - a.goals_for).slice(0, 5),
        bestDefense: [...teams].sort((a, b) => a.goals_against - b.goals_against).slice(0, 5)
      },
      individualRankings: {
        topScorers: scorersRes.rows.slice(0, 5),
        topYellowCards: yellowsRes.rows.slice(0, 5),
        topRedCards: redsRes.rows.slice(0, 5)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener las estadísticas" });
  }
});

// Obtener ranking de usuarios por puntos de porra
router.get("/user-ranking", async (req, res) => {
  const { season_id } = req.query;

  try {
    let sId = season_id;
    if (!sId) {
      const activeSeason = await db.query("SELECT id FROM seasons WHERE is_active = true LIMIT 1");
      sId = activeSeason.rows[0]?.id;
    }

    const query = `
      SELECT u.id, u.username, COALESCE(up.points, 0) as points
      FROM users u
      LEFT JOIN user_points up ON u.id = up.user_id AND up.season_id = $1
      WHERE u.role = 'user'
      ORDER BY points DESC, u.username ASC 
      LIMIT 10
    `;
    const result = await db.query(query, [sId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener el ranking de usuarios" });
  }
});

// Obtener estadísticas de porra del usuario logueado
router.get("/user-stats", verifyToken, async (req, res) => {
  const userId = req.authData.id;
  const { season_id } = req.query;

  try {
    let sId = season_id;
    if (!sId) {
      const activeSeason = await db.query("SELECT id FROM seasons WHERE is_active = true LIMIT 1");
      sId = activeSeason.rows[0]?.id;
    }

    // 1. Puntos de la temporada y posición en el ranking
    const statsRes = await db.query(`
      WITH user_ranks AS (
        SELECT user_id, points, RANK() OVER (ORDER BY points DESC) as rank
        FROM user_points 
        WHERE season_id = $1
      )
      SELECT COALESCE(points, 0) as points, COALESCE(rank, 0) as rank 
      FROM user_ranks WHERE user_id = $2
    `, [sId, userId]);

    // Si no tiene registros en user_points, devolvemos 0
    const points = statsRes.rows.length > 0 ? statsRes.rows[0].points : 0;
    const rank = statsRes.rows.length > 0 ? statsRes.rows[0].rank : 0;

    // 2. Historial de votos (los últimos 20 de la temporada)
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
      WHERE mv.user_id = $1 AND m.season_id = $2
      ORDER BY m.date DESC
      LIMIT 20
    `, [userId, sId]);

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

module.exports = router;
