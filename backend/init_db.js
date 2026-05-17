const db = require("./db");

async function initDb() {
  try {
    console.log("Starting table creation...");

    // Crear ENUMs seguros
    await db.query(`
      DO $$ BEGIN
          CREATE TYPE match_phase AS ENUM (
              'fase_de_grupos',
              'octavos',
              'cuartos',
              'semis',
              'final'
          );
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
          CREATE TYPE match_status AS ENUM (
              'pendiente',
              'en_curso',
              'finalizado'
          );
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
          CREATE TYPE event_type AS ENUM (
              'gol',
              'tarjeta_amarilla',
              'tarjeta_roja'
          );
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
          CREATE TYPE role AS ENUM (
              'admin',
              'referee',
              'user'
          );
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
          CREATE TYPE vote_type AS ENUM (
              'local',
              'empate',
              'visitante'
          );
      EXCEPTION
          WHEN duplicate_object THEN null;
      END $$;
    `);

    // 1. Temporadas
    await db.query(`
      CREATE TABLE IF NOT EXISTS seasons (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          start_date DATE,
          end_date DATE,
          is_active BOOLEAN DEFAULT FALSE
      );
    `);

    // 2. Grupos
    await db.query(`
      CREATE TABLE IF NOT EXISTS groups (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE
      );
    `);

    // 3. Equipos
    await db.query(`
      CREATE TABLE IF NOT EXISTS teams (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          kit_color VARCHAR(100),
          logo_url TEXT,
          delegate VARCHAR(255),
          coach VARCHAR(255),
          phone VARCHAR(20),
          is_active BOOLEAN DEFAULT TRUE
      );
    `);

    // 4. Jugadores
    await db.query(`
      CREATE TABLE IF NOT EXISTS players (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          birth_date DATE,
          photo_url TEXT,
          is_active BOOLEAN DEFAULT TRUE
      );
    `);

    // 5. Asociación jugadores <-> equipo por temporada
    await db.query(`
      CREATE TABLE IF NOT EXISTS team_players (
          id SERIAL PRIMARY KEY,
          team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
          player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
          season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
          jersey_number VARCHAR(10),
          UNIQUE(team_id, player_id, season_id)
      );
    `);

    // 6. Campos
    await db.query(`
      CREATE TABLE IF NOT EXISTS fields (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          location TEXT,
          is_active BOOLEAN DEFAULT TRUE
      );
    `);

    // 7. Partidos
    await db.query(`
      CREATE TABLE IF NOT EXISTS matches (
          id SERIAL PRIMARY KEY,
          home_team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
          away_team_id INTEGER REFERENCES teams(id) ON DELETE RESTRICT,
          home_team_placeholder VARCHAR(255),
          away_team_placeholder VARCHAR(255),
          group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
          season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
          field_id INTEGER REFERENCES fields(id) ON DELETE SET NULL,
          date TIMESTAMP,
          home_goals INTEGER DEFAULT 0,
          away_goals INTEGER DEFAULT 0,
          home_penalty_goals INTEGER DEFAULT 0,
          away_penalty_goals INTEGER DEFAULT 0,
          phase match_phase DEFAULT 'fase_de_grupos' NOT NULL,
          status match_status DEFAULT 'pendiente' NOT NULL,
          observations TEXT,
          locked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          locked_at TIMESTAMP,
          CHECK (home_team_id <> away_team_id),
          is_active BOOLEAN DEFAULT TRUE
      );
    `);

    // 8. Eventos del partido
    await db.query(`
      CREATE TABLE IF NOT EXISTS match_events (
          id SERIAL PRIMARY KEY,
          match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
          player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
          type event_type NOT NULL
      );
    `);

    // 9. Usuarios
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          role role DEFAULT 'user' NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          is_verified BOOLEAN DEFAULT FALSE,
          verification_token VARCHAR(255) DEFAULT NULL,
          reset_token VARCHAR(255) DEFAULT NULL,
          reset_token_expires TIMESTAMP DEFAULT NULL,
          recovery_key VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 10. Puntos de usuario por temporada
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_points (
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
          points INTEGER DEFAULT 0,
          PRIMARY KEY (user_id, season_id)
      );
    `);

    // 11. Seguidores de equipos (N:M)
    await db.query(`
      CREATE TABLE IF NOT EXISTS team_followers (
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, team_id)
      );
    `);

    // 12. Estadísticas de equipo
    await db.query(`
      CREATE TABLE IF NOT EXISTS team_stats (
          id SERIAL PRIMARY KEY,
          team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
          group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
          season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
          played INTEGER DEFAULT 0,
          won INTEGER DEFAULT 0,
          drawn INTEGER DEFAULT 0,
          lost INTEGER DEFAULT 0,
          goals_for INTEGER DEFAULT 0,
          goals_against INTEGER DEFAULT 0,
          points INTEGER DEFAULT 0,
          yellow_cards INTEGER DEFAULT 0,
          red_cards INTEGER DEFAULT 0,
          UNIQUE(team_id, group_id, season_id)
      );
    `);

    // 13. Estadísticas de jugador
    await db.query(`
      CREATE TABLE IF NOT EXISTS player_stats (
          id SERIAL PRIMARY KEY,
          player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
          season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
          goals INTEGER DEFAULT 0,
          yellow_cards INTEGER DEFAULT 0,
          red_cards INTEGER DEFAULT 0,
          matches_played INTEGER DEFAULT 0,
          UNIQUE(player_id, season_id)
      );
    `);

    // 14. Votos de partidos
    await db.query(`
      CREATE TABLE IF NOT EXISTS match_votes (
          id SERIAL PRIMARY KEY,
          match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          vote vote_type NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(match_id, user_id)
      );
    `);

    // 15. Logs de auditoría
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          action VARCHAR(100) NOT NULL,
          entity_type VARCHAR(50),
          entity_id INTEGER,
          details JSONB,
          season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("All tables have been created successfully.");
  } catch (err) {
    console.error("Error initializing the database:", err);
  } finally {
    process.exit();
  }
}

initDb();
