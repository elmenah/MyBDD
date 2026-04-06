const express = require('express');

const BUCKET = 'media';

module.exports = function (db) {
  const router = express.Router();

  // Obtener todos los archivos (con filtros opcionales)
  router.get('/files', async (req, res) => {
    try {
      const { type, sort = 'desc', page = 1, limit = 50 } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      let query = db.from('files')
        .select('id, filename, original_name, type, mimetype, size, url, created_at', { count: 'exact' })
        .order('created_at', { ascending: sort === 'asc' })
        .range(offset, offset + limitNum - 1);

      if (type === 'image' || type === 'video') {
        query = query.eq('type', type);
      }

      const { data: files, count, error } = await query;
      if (error) throw error;

      const mapped = (files || []).map(f => ({
        id: f.id,
        filename: f.filename,
        originalName: f.original_name,
        type: f.type,
        mimetype: f.mimetype,
        size: f.size,
        url: f.url,
        createdAt: f.created_at,
      }));

      res.json({
        files: mapped,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limitNum),
        },
      });
    } catch (err) {
      console.error('Error al obtener archivos:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Obtener estadísticas
  router.get('/stats', async (req, res) => {
    try {
      const { data: all, error } = await db.from('files').select('type, size');
      if (error) throw error;

      const stats = {
        totalFiles: all.length,
        totalSize: all.reduce((sum, f) => sum + Number(f.size), 0),
        totalImages: all.filter(f => f.type === 'image').length,
        totalVideos: all.filter(f => f.type === 'video').length,
      };

      res.json(stats);
    } catch (err) {
      console.error('Error al obtener estadísticas:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Eliminar un archivo
  router.delete('/files/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { data, error: fetchErr } = await db.from('files').select('*').eq('id', id).single();

      if (fetchErr || !data) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
      }

      // Eliminar de Supabase Storage
      if (data.public_id) {
        const { error: storageErr } = await db.storage.from(BUCKET).remove([data.public_id]);
        if (storageErr) console.error('Error al eliminar de Storage:', storageErr);
      }

      // Eliminar de la tabla
      const { error: delErr } = await db.from('files').delete().eq('id', id);
      if (delErr) throw delErr;

      res.json({ success: true, message: 'Archivo eliminado' });
    } catch (err) {
      console.error('Error al eliminar archivo:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  return router;
};
