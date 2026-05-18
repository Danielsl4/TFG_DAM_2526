const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../../db");
const rateLimit = require("express-rate-limit");
const { default: RedisStore } = require("rate-limit-redis");
const { redis } = require("../utils/cache");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const secretKey = process.env.JWT_SECRET;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';

// Configuración de Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Configurar el rate limiter: usa Redis si está disponible, si no, usa memoria local (evita caídas)
const authLimiter = rateLimit({
  // Si redis no está listo, no pasamos store (usa MemoryStore por defecto)
  store: redis.status === "ready" ? new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  }) : undefined,
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Límite de 10 intentos por IP cada 15 minutos
  message: { message: "Demasiados intentos. Por favor, inténtalo de nuevo en 15 minutos." },
  standardHeaders: true, 
  legacyHeaders: false,
});

// Register route
router.post("/register", authLimiter, async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ message: "Username, email and password required" });
  }

  try {
    // Check if user exists (accent and case insensitive)
    const userCheck = await db.query(
      "SELECT * FROM users WHERE unaccent(username) ILIKE unaccent($1) OR LOWER(email) = LOWER($2)",
      [username, email],
    );
    if (userCheck.rows.length > 0) {
      const existingUser = userCheck.rows[0];
      if (existingUser.username === username) {
        return res.status(409).json({ message: "Username already exists" });
      } else {
        return res.status(409).json({ message: "Email already exists" });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generar clave de recuperación de emergencia
    const recoveryKeyPlain = 'REC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const recoveryKeyHash = await bcrypt.hash(recoveryKeyPlain, 10);

    // Insert user
    const newUserResult = await db.query(
      "INSERT INTO users (username, email, password, role, recovery_key) VALUES ($1, $2, $3, 'user', $4) RETURNING id, username, email, role",
      [username, email, hashedPassword, recoveryKeyHash],
    );

    const user = newUserResult.rows[0];

    // Generar token de verificación
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    await db.query(
      "UPDATE users SET verification_token = $1 WHERE id = $2",
      [verificationToken, user.id]
    );

    const verifyLink = `${frontendUrl}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER || '"Soporte" <noreply@tfg.com>',
      to: email,
      subject: 'Verifica tu cuenta',
      text: `¡Hola ${username}!\n\nGracias por registrarte. Por favor, haz clic en el siguiente enlace para verificar tu cuenta y poder iniciar sesión:\n\n${verifyLink}\n\nIMPORTANTE: Tienes 24 horas para verificar tu cuenta. Si no lo haces en este plazo, tu cuenta será eliminada automáticamente por seguridad.\n\nSi no te has registrado, puedes ignorar este correo.`
    };

    let emailSent = true;
    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error("Error al enviar el correo de verificación:", error);
      emailSent = false;
    }

    res.status(201).json({
      message: emailSent
        ? "Registro exitoso. Por favor, revisa tu correo para verificar tu cuenta."
        : "Registro exitoso, pero el servicio de correo no pudo enviar el mensaje de confirmación.",
      emailSent,
      verificationToken: emailSent ? null : verificationToken,
      recoveryKey: recoveryKeyPlain,
      user: user
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error registering user" });
  }
});

// Login route
router.post("/login", authLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password required" });
  }

  try {
    // Find user (accent and case insensitive)
    const result = await db.query("SELECT * FROM users WHERE unaccent(username) ILIKE unaccent($1) OR LOWER(email) = LOWER($1)", [
      username,
    ]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Usuario o contraseña incorrectos" });
    }

    if (user.is_active === false) {
      return res.status(403).json({ message: "Esta cuenta ha sido desactivada." });
    }

    if (user.is_verified === false) {
      return res.status(403).json({ 
        message: "Por favor, revisa tu bandeja de entrada y verifica tu correo electrónico antes de iniciar sesión.",
        not_verified: true
      });
    }

    // Validate password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Usuario o contraseña incorrectos" });
    }

    // Generate token
    const expiresIn = (user.role === 'admin' || user.role === 'referee') ? "6h" : "7d";
    
    jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      secretKey,
      { expiresIn },
      (err, token) => {
        if (err) {
          return res.status(500).json({ message: "Error generating token" });
        }
        res.json({ token });
      },
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error logging in" });
  }
});

// --- LOGIN ---

// Route: /forgot-password
router.post("/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "El email es requerido" });
  }

  try {
    const result = await db.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [email]);
    
    // Si no existe, devolvemos success igual por seguridad
    if (result.rows.length === 0) {
      return res.json({ message: "Si el correo está registrado, recibirás un enlace de recuperación." });
    }
    
    const user = result.rows[0];

    // Generar token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    
    await db.query(
      "UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3",
      [token, expires, user.id]
    );

    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER || '"Soporte" <noreply@tfg.com>',
      to: email,
      subject: 'Recuperación de contraseña',
      text: `Has solicitado recuperar tu contraseña. Haz clic en el siguiente enlace para restablecerla:\n\n${resetLink}\n\nSi no fuiste tú, ignora este correo. El enlace caducará en 60 minutos.`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error al enviar el correo:", error);
        return res.status(500).json({ message: "Error al enviar el correo de recuperación." });
      } else {
        return res.json({ message: "Si el correo está registrado, recibirás un enlace de recuperación." });
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error en el servidor al procesar la solicitud" });
  }
});

// Route: /reset-password
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ message: "Token y nueva contraseña requeridos" });
  }

  try {
    const result = await db.query(
      "SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()",
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "El token es inválido o ha caducado." });
    }
    
    const user = result.rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await db.query(
      "UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
      [hashedPassword, user.id]
    );

    return res.json({ message: "Contraseña actualizada correctamente." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error en el servidor al restablecer contraseña" });
  }
});

// Route: /reset-password-recovery
router.post("/reset-password-recovery", authLimiter, async (req, res) => {
  const { email, recoveryKey, newPassword } = req.body;

  if (!email || !recoveryKey || !newPassword) {
    return res.status(400).json({ message: "Email, clave de recuperación y nueva contraseña requeridos" });
  }

  try {
    const result = await db.query(
      "SELECT id, recovery_key FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    const user = result.rows[0];

    if (!user.recovery_key) {
      return res.status(400).json({ message: "La clave de recuperación es incorrecta." });
    }

    const isMatch = await bcrypt.compare(recoveryKey.trim(), user.recovery_key);
    if (!isMatch) {
      return res.status(400).json({ message: "La clave de recuperación es incorrecta." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña
    await db.query(
      "UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
      [hashedPassword, user.id]
    );

    return res.json({ message: "Contraseña restablecida correctamente con tu clave de emergencia." });
  } catch (error) {
    console.error("Error al restablecer contraseña con clave de recuperación:", error);
    return res.status(500).json({ message: "Error en el servidor al restablecer contraseña." });
  }
});

// Route: /resend-verification
router.post("/resend-verification", authLimiter, async (req, res) => {
  const { email, username } = req.body;

  if (!email && !username) {
    return res.status(400).json({ message: "El email o usuario es requerido" });
  }

  try {
    const identifier = email || username;
    const result = await db.query(
      "SELECT id, username, email, is_verified FROM users WHERE LOWER(email) = LOWER($1) OR unaccent(username) ILIKE unaccent($1)",
      [identifier]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No existe ninguna cuenta asociada." });
    }

    const user = result.rows[0];
    const userEmail = user.email;

    if (user.is_verified) {
      return res.status(400).json({ message: "Esta cuenta ya ha sido verificada." });
    }

    // Generar nuevo token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    await db.query(
      "UPDATE users SET verification_token = $1 WHERE id = $2",
      [verificationToken, user.id]
    );

    const verifyLink = `${frontendUrl}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER || '"Soporte" <noreply@tfg.com>',
      to: userEmail,
      subject: 'Verifica tu cuenta',
      text: `¡Hola ${user.username}!\n\nHas solicitado reenviar el correo de verificación. Por favor, haz clic en el siguiente enlace para verificar tu cuenta:\n\n${verifyLink}\n\nIMPORTANTE: Recuerda que tienes un plazo de 24 horas desde la creación de la cuenta para verificarla, de lo contrario será eliminada automáticamente.\n\nSi no has solicitado esto, puedes ignorar este correo.`
    };

    let emailSent = true;
    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error("Error al enviar el correo de verificación:", error);
      emailSent = false;
    }

    if (!emailSent) {
      return res.json({
        message: "El servicio de correo no pudo enviar el mensaje, pero puedes activar tu cuenta ahora mismo.",
        emailSent: false,
        verificationToken
      });
    }

    return res.json({
      message: "Se ha reenviado el correo de verificación. Por favor, revisa tu bandeja de entrada.",
      emailSent: true
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error en el servidor al reenviar verificación" });
  }
});

// Route: /verify-email/:token
router.get("/verify-email/:token", async (req, res) => {
  const { token } = req.params;

  try {
    const result = await db.query(
      "SELECT id, username, role FROM users WHERE verification_token = $1",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Token de verificación inválido o la cuenta ya ha sido verificada." });
    }

    const user = result.rows[0];

    await db.query(
      "UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = $1",
      [user.id]
    );

    // Generate token for automatic login
    const expiresIn = (user.role === 'admin' || user.role === 'referee') ? "6h" : "7d";

    jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      secretKey,
      { expiresIn },
      (err, jwtToken) => {
        if (err) {
          console.error("JWT Error on Verification:", err);
          return res.status(500).json({ message: "Cuenta verificada pero hubo un error al iniciar sesión automáticamente." });
        }
        res.json({ 
          message: "Cuenta verificada correctamente. Iniciando sesión...",
          token: jwtToken
        });
      },
    );

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error en el servidor al verificar cuenta" });
  }
});

module.exports = router;
