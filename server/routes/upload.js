const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Tipos MIME permitidos
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska',
]);

// Límite de tamaño: 100MB (Cloudinary free tier)
const MAX_SIZE = 100 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
    }
  },
  limits: { fileSize: MAX_SIZE },
});

// Subir buffer a Cloudinary
function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    Readable.from(buffer).pipe(stream);
  });
}

module.exports = function (db) {
  const router = express.Router();

  // Subir un solo archivo
  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No se envió ningún archivo' });
      }

      const id = uuidv4();
      const type = file.mimetype.startsWith('image') ? 'image' : 'video';
      const resourceType = type === 'image' ? 'image' : 'video';

      const result = await uploadToCloudinary(file.buffer, {
        folder: `mybdd/${type}s`,
        resource_type: resourceType,
        public_id: id,
      });

      const { error } = await db.from('files').insert({
        id,
        filename: result.public_id,
        original_name: file.originalname,
        type,
        mimetype: file.mimetype,
        size: file.size,
        url: result.secure_url,
        public_id: result.public_id,
      });

      if (error) throw error;

      res.json({
        success: true,
        file: { id, originalName: file.originalname, type, url: result.secure_url },
      });
    } catch (err) {
      console.error('Error al subir archivo:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Subir múltiples archivos
  router.post('/upload-multiple', upload.array('files', 20), async (req, res) => {
    try {
      const files = req.files;
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No se enviaron archivos' });
      }

      const results = [];

      for (const file of files) {
        const id = uuidv4();
        const type = file.mimetype.startsWith('image') ? 'image' : 'video';
        const resourceType = type === 'image' ? 'image' : 'video';

        const cloudResult = await uploadToCloudinary(file.buffer, {
          folder: `mybdd/${type}s`,
          resource_type: resourceType,
          public_id: id,
        });

        const { error } = await db.from('files').insert({
          id,
          filename: cloudResult.public_id,
          original_name: file.originalname,
          type,
          mimetype: file.mimetype,
          size: file.size,
          url: cloudResult.secure_url,
          public_id: cloudResult.public_id,
        });

        if (error) throw error;

        results.push({ id, originalName: file.originalname, type, url: cloudResult.secure_url });
      }

      res.json({ success: true, files: results, count: results.length });
    } catch (err) {
      console.error('Error al subir archivos:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Manejo de error de multer
  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'El archivo excede el límite de 100MB' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });

  return router;
};
