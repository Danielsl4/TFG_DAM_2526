const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const sharp = require('sharp');

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuración de Multer (almacenamiento en memoria para procesar con Sharp)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'), false);
    }
  }
});

/**
 * Procesa una imagen con Sharp y la sube a Cloudinary.
 * 
 * @param {Buffer} fileBuffer - Buffer de la imagen original.
 * @param {string} folder - Carpeta de destino en Cloudinary (ej: 'teams', 'players').
 * @param {string} [publicId] - Nombre personalizado para el archivo (opcional).
 * @returns {Promise<string>} - URL de la imagen subida.
 */
async function uploadImage(fileBuffer, folder, publicId = null) {
  try {
    // 1. Procesar con Sharp
    const processedImage = await sharp(fileBuffer)
      .resize(400, 400, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 80 })
      .toBuffer();

    // 2. Subir a Cloudinary usando un Stream
    return new Promise((resolve, reject) => {
      const uploadOptions = { 
        folder: `tfg_futsal/${folder}`,
        resource_type: 'image'
      };

      // Si nos pasan un nombre, lo usamos (quitando espacios y caracteres raros)
      if (publicId) {
        uploadOptions.public_id = publicId.toLowerCase().replace(/[^a-z0-9]/g, '_');
        uploadOptions.invalidate = true; 
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            console.error("Error en Cloudinary:", error);
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      );
      uploadStream.end(processedImage);
    });
  } catch (err) {
    console.error("Error procesando imagen con Sharp:", err);
    throw err;
  }
}

/**
 * Elimina una imagen de Cloudinary a partir de su URL completa.
 * 
 * @param {string} url - URL completa de la imagen en Cloudinary.
 * @returns {Promise<void>}
 */
async function deleteImage(url) {
  if (!url || !url.includes('cloudinary.com')) return;

  try {
    // Las URLs de Cloudinary tienen el formato:
    // https://res.cloudinary.com/[cloud_name]/image/upload/v[version]/[folder]/[public_id].[ext]
    
    // 1. Extraemos la parte después de 'upload/'
    const uploadIndex = url.indexOf('upload/');
    if (uploadIndex === -1) return;

    const relevantPath = url.substring(uploadIndex + 7); // Saltamos 'upload/'
    
    // 2. Quitamos la versión si existe (empieza por 'v' seguida de números)
    // El formato puede ser: v12345678/folder/image.webp o folder/image.webp
    const pathParts = relevantPath.split('/');
    if (pathParts[0].startsWith('v') && !isNaN(pathParts[0].substring(1))) {
      pathParts.shift();
    }

    // 3. Unimos el resto y quitamos la extensión para obtener el public_id
    const fullPublicIdWithExt = pathParts.join('/');
    const publicId = fullPublicIdWithExt.split('.')[0];

    console.log(`Intentando eliminar de Cloudinary: ${publicId}`);
    const result = await cloudinary.uploader.destroy(publicId);
    console.log("Resultado Cloudinary:", result);
  } catch (err) {
    console.error("Error al eliminar imagen de Cloudinary:", err);
  }
}

/**
 * Extrae el public_id de una URL de Cloudinary
 */
function getPublicId(url) {
  if (!url) return null;
  const parts = url.split("/");
  const folderIndex = parts.findIndex(p => p === 'tfg_futsal');
  if (folderIndex === -1) return null;

  const publicIdWithExtension = parts.slice(folderIndex).join("/");
  return publicIdWithExtension.split(".")[0];
}

module.exports = { upload, uploadImage, deleteImage, getPublicId };
