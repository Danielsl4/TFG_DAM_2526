const express = require("express");
const router = express.Router();
const db = require("../../db");
const { verifyToken, verifyAdmin } = require("../middlewares/auth");
const { logAction } = require("../utils/logger");

// Obtener todos los campos
router.get("/", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM fields WHERE is_active = true ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener los campos" });
  }
});

// --- ADMIN ---

// Crear campo
router.post("/", verifyToken, verifyAdmin, async (req, res) => {
  const { name, location } = req.body;
  if (!name) return res.status(400).json({ message: "El nombre del campo es obligatorio" });

  try {
    const query = "INSERT INTO fields (name, location) VALUES ($1, $2) RETURNING *";
    const result = await db.query(query, [name, location]);
    const newField = result.rows[0];

    await logAction(req.authData.id, 'Creación de campo', 'field', newField.id, { name: newField.name });
    res.status(201).json(newField);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al crear el campo" });
  }
});

// Editar campo
router.put("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, location } = req.body;

  try {
    const query = "UPDATE fields SET name = $1, location = $2 WHERE id = $3 RETURNING *";
    const result = await db.query(query, [name, location, id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Campo no encontrado" });

    const updatedField = result.rows[0];
    await logAction(req.authData.id, 'Actualización de campo', 'field', id, { name: updatedField.name });
    res.json(updatedField);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al actualizar el campo" });
  }
});

// Eliminar campo (BORRADO LÓGICO)
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const fieldRes = await db.query("SELECT name FROM fields WHERE id = $1", [id]);
    if (fieldRes.rows.length === 0) return res.status(404).json({ message: "Campo no encontrado" });
    const fieldName = fieldRes.rows[0].name;

    await db.query("UPDATE fields SET is_active = false WHERE id = $1", [id]);
    await logAction(req.authData.id, 'Eliminación lógica de campo', 'field', id, { name: fieldName });
    res.json({ message: "Campo enviado a la papelera correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al eliminar el campo" });
  }
});

// Obtener campos eliminados (Papelera)
router.get("/admin/trash", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM fields WHERE is_active = false ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al obtener la papelera de campos" });
  }
});

// Restaurar un campo eliminado
router.post("/:id/restore", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("UPDATE fields SET is_active = true WHERE id = $1 RETURNING name", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Campo no encontrado" });
    
    await logAction(req.authData.id, 'Restauración de campo', 'field', id, { name: result.rows[0].name });
    res.json({ message: "Campo restaurado correctamente" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al restaurar el campo" });
  }
});

// Eliminar un campo definitivamente (Borrado físico de la BD)
router.delete("/:id/permanent", verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await db.query("SELECT is_active, name FROM fields WHERE id = $1", [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: "Campo no encontrado" });
    if (check.rows[0].is_active) return res.status(400).json({ message: "No puedes borrar permanentemente un campo activo. Envíalo primero a la papelera." });

    await db.query("DELETE FROM fields WHERE id = $1", [id]);
    await logAction(req.authData.id, 'Eliminación permanente de campo', 'field', id, { name: check.rows[0].name });
    res.json({ message: "Campo eliminado definitivamente" });
  } catch (err) {
    console.error(err);
    if (err.code === '23503') return res.status(400).json({ message: "No se puede eliminar permanentemente: este campo tiene partidos asociados." });
    res.status(500).json({ message: "Error al eliminar definitivamente" });
  }
});

module.exports = router;
