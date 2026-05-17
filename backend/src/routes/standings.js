const express = require("express");
const router = express.Router();
const db = require("../../db");
const { redis, safeRedis } = require("../utils/cache");

const STANDINGS_CACHE_KEY = "standings";
const CACHE_TTL = 3600; // 1 hora (se invalida manualmente al terminar partidos)

// Obtener clasificación de los grupos
router.get("/", async (req, res) => {
  const { season_id } = req.query;
  const cacheKey = season_id ? `${STANDINGS_CACHE_KEY}:${season_id}` : STANDINGS_CACHE_KEY;

  const cachedData = await safeRedis.get(cacheKey);
  if (cachedData) {
    return res.json(JSON.parse(cachedData));
  }

  try {

    // Si no se pasa season_id, buscamos la temporada activa
    let seasonFilter = "s.is_active = true";
    let params = [];
    if (season_id) {
      seasonFilter = "ts.season_id = $1";
      params.push(season_id);
    }

    const statsQuery = `
      SELECT ts.group_id, g.name as group_name, ts.team_id as id, t.name as team_name, t.logo_url as team_logo,
             ts.points, ts.played, ts.won, ts.drawn, ts.lost, ts.goals_for, ts.goals_against,
             (ts.goals_for - ts.goals_against) as goal_difference, ts.yellow_cards, ts.red_cards
      FROM team_stats ts JOIN teams t ON ts.team_id = t.id
      JOIN groups g ON ts.group_id = g.id JOIN seasons s ON ts.season_id = s.id
      WHERE ${seasonFilter}
    `;
    const statsResult = await db.query(statsQuery, params);

    const matchesQuery = season_id 
      ? "SELECT * FROM matches WHERE phase = 'fase_de_grupos' AND status = 'finalizado' AND season_id = $1"
      : "SELECT m.* FROM matches m JOIN seasons s ON m.season_id = s.id WHERE m.phase = 'fase_de_grupos' AND m.status = 'finalizado' AND s.is_active = true";
    const matchesResult = await db.query(matchesQuery, params);
    const allMatches = matchesResult.rows;

    const groups = {};
    statsResult.rows.forEach((row) => {
      if (!groups[row.group_name]) groups[row.group_name] = [];
      groups[row.group_name].push(row);
    });

    const sortTeams = (teams, groupMatches) => {
      return teams.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const tiedTeams = teams.filter((t) => t.points === a.points);
        if (tiedTeams.length >= 2) {
          const tiedIds = tiedTeams.map((t) => t.id);
          const miniMatches = groupMatches.filter(m => tiedIds.includes(m.home_team_id) && tiedIds.includes(m.away_team_id));
          const miniStats = {};
          tiedIds.forEach((id) => (miniStats[id] = { pts: 0, gd: 0, gf: 0 }));
          miniMatches.forEach((m) => {
            miniStats[m.home_team_id].gf += m.home_goals; miniStats[m.home_team_id].gd += m.home_goals - m.away_goals;
            miniStats[m.away_team_id].gf += m.away_goals; miniStats[m.away_team_id].gd += m.away_goals - m.home_goals;
            if (m.home_goals > m.away_goals) miniStats[m.home_team_id].pts += 3;
            else if (m.home_goals < m.away_goals) miniStats[m.away_team_id].pts += 3;
            else { miniStats[m.home_team_id].pts += 1; miniStats[m.away_team_id].pts += 1; }
          });
          if (tiedTeams.length === 2) {
            if (miniStats[b.id].pts !== miniStats[a.id].pts) return miniStats[b.id].pts - miniStats[a.id].pts;
            if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
            const fpA = (a.yellow_cards || 0) + (a.red_cards || 0) * 3;
            const fpB = (b.yellow_cards || 0) + (b.red_cards || 0) * 3;
            if (fpA !== fpB) return fpA - fpB;
            if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
            if (a.goals_against !== b.goals_against) return a.goals_against - b.goals_against;
            return b.id - a.id;
          } else {
            if (miniStats[b.id].pts !== miniStats[a.id].pts) return miniStats[b.id].pts - miniStats[a.id].pts;
            const fpA = (a.yellow_cards || 0) + (a.red_cards || 0) * 3;
            const fpB = (b.yellow_cards || 0) + (b.red_cards || 0) * 3;
            if (fpA !== fpB) return fpA - fpB;
            if (miniStats[b.id].gd !== miniStats[a.id].gd) return miniStats[b.id].gd - miniStats[a.id].gd;
            if (miniStats[b.id].gf !== miniStats[a.id].gf) return miniStats[b.id].gf - miniStats[a.id].gf;
          }
        }
        if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
        if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
        return a.goals_against - b.goals_against;
      });
    };

    const sortedGroups = {};
    for (const groupName in groups) {
      const gTeams = groups[groupName];
      const gMatches = allMatches.filter(m => m.group_id === gTeams[0].group_id);
      sortedGroups[groupName] = sortTeams(gTeams, gMatches);
    }

    const fourthPlaces = [];
    const groupLengths = Object.values(sortedGroups).map((g) => g.length);
    const minGroupSize = groupLengths.length > 0 ? Math.min(...groupLengths) : 0;
    for (const groupName in sortedGroups) {
      const teams = sortedGroups[groupName];
      if (teams.length >= 4) {
        let fourth = { ...teams[3] };
        if (teams.length > minGroupSize) {
          const lastTeam = teams[teams.length - 1];
          const matchAgainstLast = allMatches.find(m => (m.home_team_id === fourth.id && m.away_team_id === lastTeam.id) || (m.home_team_id === lastTeam.id && m.away_team_id === fourth.id));
          if (matchAgainstLast) {
            const isHome = matchAgainstLast.home_team_id === fourth.id;
            const hG = matchAgainstLast.home_goals; const aG = matchAgainstLast.away_goals;
            fourth.played--; fourth.goals_for -= isHome ? hG : aG; fourth.goals_against -= isHome ? aG : hG;
            fourth.goal_difference = fourth.goals_for - fourth.goals_against;
            if (isHome) { if (hG > aG) fourth.points -= 3; else if (hG === aG) fourth.points -= 1; } 
            else { if (aG > hG) fourth.points -= 3; else if (aG === hG) fourth.points -= 1; }
          }
        }
        fourthPlaces.push(fourth);
      }
    }
    const bestFourthsSorted = sortTeams([...fourthPlaces], allMatches);
    const standingsData = {
      groups: sortedGroups,
      bestFourthId: bestFourthsSorted.length > 0 ? bestFourthsSorted[0].id : null,
      fourthPlacesRanking: bestFourthsSorted,
    };

    // Guardar en caché antes de responder
    await safeRedis.set(cacheKey, JSON.stringify(standingsData), "EX", CACHE_TTL);

    res.json(standingsData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener la clasificación" });
  }
});

module.exports = router;
