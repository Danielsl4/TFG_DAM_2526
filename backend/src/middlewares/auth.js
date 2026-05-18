const jwt = require("jsonwebtoken");
const secretKey = process.env.JWT_SECRET;
const db = require("../../db");

/**
 * Middleware para verificar token (OBLIGATORIO)
 * Si no hay token o no es válido, corta la petición con un 403.
 */
function verifyToken(req, res, next) {
  let bearerToken;
  const bearerHeader = req.headers["authorization"];

  if (typeof bearerHeader !== "undefined") {
    const bearer = bearerHeader.split(" ");
    bearerToken = bearer[1];
  } else if (req.query && req.query.token) {
    bearerToken = req.query.token;
  }

  if (bearerToken) {
    jwt.verify(bearerToken, secretKey, (err, authData) => {
      if (err) {
        res.status(401).json({ code: "TOKEN_EXPIRED", message: "Sesión inválida o expirada" });
      } else {
        req.authData = authData;
        req.token = bearerToken;
        next();
      }
    });
  } else {
    res.status(401).json({ code: "TOKEN_MISSING", message: "No se proporcionó un token de autenticación" });
  }
}

/**
 * Middleware para verificar token (OPCIONAL)
 * Si hay token lo valida y guarda el usuario, si no hay o falla sigue adelante igualmente.
 */
function optionalVerifyToken(req, res, next) {
  let bearerToken;
  const bearerHeader = req.headers["authorization"];

  if (typeof bearerHeader !== "undefined") {
    const bearer = bearerHeader.split(" ");
    bearerToken = bearer[1];
  } else if (req.query && req.query.token) {
    bearerToken = req.query.token;
  }

  if (bearerToken) {
    jwt.verify(bearerToken, secretKey, (err, authData) => {
      if (!err) {
        req.authData = authData;
        req.token = bearerToken;
      }
      next();
    });
  } else {
    next();
  }
}

/**
 * Solo admins
 */
function verifyAdmin(req, res, next) {
  if (req.authData && req.authData.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: "Acceso denegado: se requiere rol de administrador" });
  }
}

/**
 * Admins y árbitros
 */
function verifyReferee(req, res, next) {
  if (req.authData && (req.authData.role === 'admin' || req.authData.role === 'referee')) {
    next();
  } else {
    res.status(403).json({ message: "Acceso denegado: se requiere rol de árbitro o administrador" });
  }
}
/**
 * Verifica si el partido está bloqueado por otro usuario.
 * Solo permite continuar si el partido está libre, el bloqueo ha expirado,
 * o si el usuario actual es el dueño del bloqueo o un admin.
 */
async function verifyMatchLock(req, res, next) {
  const matchId = req.params.id || req.params.matchId;
  const userId = req.authData.id;
  const userRole = req.authData.role;

  if (!matchId) return next(); // Si no hay ID en la ruta, seguimos (p. ej. listado)

  try {
    const result = await db.query(
      "SELECT locked_by, locked_at FROM matches WHERE id = $1",
      [matchId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Partido no encontrado" });
    }

    const { locked_by, locked_at } = result.rows[0];

    // Un bloqueo se considera expirado tras 2 minutos de inactividad
    const isLockExpired = !locked_at || (new Date() - new Date(locked_at) > 120000);

    if (isLockExpired) {
      if (locked_by) {
        // Limpieza proactiva: si ha caducado, lo borramos físicamente de la DB
        await db.query("UPDATE matches SET locked_by = NULL, locked_at = NULL WHERE id = $1", [matchId]);
      }
      return next(); 
    }

    if (!locked_by) return next();

    if (locked_by === userId) {
      return next(); // El usuario es el dueño del bloqueo
    }

    // El partido está bloqueado activamente por otra persona
    const ownerRes = await db.query("SELECT username FROM users WHERE id = $1", [locked_by]);
    const ownerName = ownerRes.rows[0]?.username || "otro usuario";

    res.status(409).json({
      message: `El partido está siendo editado por ${ownerName}`,
      success: false,
      owner: ownerName
    });
  } catch (err) {
    console.error("Error en verifyMatchLock:", err);
    res.status(500).json({ message: "Error al verificar el estado del partido" });
  }
}
module.exports = {
  verifyToken,
  optionalVerifyToken,
  verifyAdmin,
  verifyReferee,
  verifyMatchLock
};
