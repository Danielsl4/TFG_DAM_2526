require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");

// Importar Rutas Modularizadas
const authRoutes = require("./src/routes/auth");
const userRoutes = require("./src/routes/users");
const matchRoutes = require("./src/routes/matches");
const teamRoutes = require("./src/routes/teams");
const playerRoutes = require("./src/routes/players");
const standingsRoutes = require("./src/routes/standings");
const statisticsRoutes = require("./src/routes/statistics");
const adminRoutes = require("./src/routes/admin");
const seasonRoutes = require("./src/routes/seasons");
const groupRoutes = require("./src/routes/groups");
const fieldRoutes = require("./src/routes/fields");

// Inicializar Tareas Programadas (Cron Jobs)
require("./src/utils/cron-jobs");

const app = express();
const port = process.env.PORT || 3000;

// --- Middlewares Globales ---

// Configuración manual de CORS (basada en el diseño original para máxima compatibilidad)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(bodyParser.json());

// --- Montaje de Rutas ---

// Montamos en la raíz para mantener compatibilidad con el frontend actual
app.use("/", authRoutes); // /login, /register
app.use("/", userRoutes); // /users, /user/profile
app.use("/matches", matchRoutes); // Rutas de partidos y gestión arbitral
app.use("/teams", teamRoutes); // Detalle de equipo y seguimiento
app.use("/players", playerRoutes); // Detalle de jugadores
app.use("/standings", standingsRoutes); // Clasificación
app.use("/statistics", statisticsRoutes); // Estadísticas globales
app.use("/admin", adminRoutes); // Panel administrativo
app.use("/seasons", seasonRoutes); // Gestión de temporadas
app.use("/groups", groupRoutes); // Gestión de grupos
app.use("/fields", fieldRoutes); // Gestión de campos

app.listen(port, () => {
  console.log(`Servidor modular iniciado en http://localhost:${port}`);
});
