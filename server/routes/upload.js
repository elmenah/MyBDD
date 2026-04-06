const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Tipos MIME permitidos
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska',
]);

// Límite de tamaño: 50MB (Supabase Storage free tier)
const MAX_SIZE = 50 * 1024 * 1024;

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

const BUCKET = 'media';

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
      const ext = path.extname(file.originalname);
      const storagePath = `${type}s/${id}${ext}`;

      // Subir a Supabase Storage
      const { error: uploadErr } = await db.storage
        .from(BUCKET)
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadErr) throw uploadErr;

      // Obtener URL pública
      const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath);
      const url = urlData.publicUrl;

      // Guardar en DB
      const { error: dbErr } = await db.from('files').insert({
        id,
        filename: storagePath,
        original_name: file.originalname,
        type,
        mimetype: file.mimetype,
        size: file.size,
        url,
        public_id: storagePath,
      });

      if (dbErr) throw dbErr;

      res.json({
        success: true,
        file: { id, originalName: file.originalname, type, url },
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
        const ext = path.extname(file.originalname);
        const storagePath = `${type}s/${id}${ext}`;

        const { error: uploadErr } = await db.storage
          .from(BUCKET)
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath);
        const url = urlData.publicUrl;

        const { error: dbErr } = await db.from('files').insert({
          id,
          filename: storagePath,
          original_name: file.originalname,
          type,
          mimetype: file.mimetype,
          size: file.size,
          url,
          public_id: storagePath,
        });

        if (dbErr) throw dbErr;

        results.push({ id, originalName: file.originalname, type, url });
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
        return res.status(413).json({ error: 'El archivo excede el límite de 50MB' });
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
