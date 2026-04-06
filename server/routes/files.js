const express = require('express');
const cloudinary = require('cloudinary').v2;

module.exports = function (db) {
  const router = express.Router();

  // Obtener todos los archivos (con filtros opcionales)
  router.get('/files', async (req, res) => {
    try {
      const { type, sort = 'desc', page = 1, limit = 50 } = req.query;

      const params = [];
      let whereClause = '';
      let paramIndex = 1;

      if (type === 'image' || type === 'video') {
        whereClause = `WHERE type = $${paramIndex++}`;
        params.push(type);
      }

      const orderDir = sort === 'asc' ? 'ASC' : 'DESC';
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      const query = `SELECT id, filename, original_name AS "originalName", type, mimetype, size, url, created_at AS "createdAt"
                     FROM files ${whereClause}
                     ORDER BY created_at ${orderDir}
                     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limitNum, offset);

      const { rows: files } = await db.query(query, params);

      // Contar total
      const countParams = [];
      let countWhere = '';
      if (type === 'image' || type === 'video') {
        countWhere = 'WHERE type = $1';
        countParams.push(type);
      }
      const { rows: countRows } = await db.query(`SELECT COUNT(*) as total FROM files ${countWhere}`, countParams);
      const total = parseInt(countRows[0].total, 10);

      res.json({
        files,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
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
      const { rows } = await db.query(`
        SELECT
          COUNT(*) as "totalFiles",
          COALESCE(SUM(size), 0) as "totalSize",
          COALESCE(SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END), 0) as "totalImages",
          COALESCE(SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END), 0) as "totalVideos"
        FROM files
      `);

      const stats = rows[0];
      stats.totalFiles = parseInt(stats.totalFiles, 10);
      stats.totalSize = parseInt(stats.totalSize, 10);
      stats.totalImages = parseInt(stats.totalImages, 10);
      stats.totalVideos = parseInt(stats.totalVideos, 10);

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
      const { rows } = await db.query('SELECT * FROM files WHERE id = $1', [id]);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
      }

      const file = rows[0];

      // Eliminar de Cloudinary
      if (file.public_id) {
        const resourceType = file.type === 'image' ? 'image' : 'video';
        try {
          await cloudinary.uploader.destroy(file.public_id, { resource_type: resourceType });
        } catch (cloudErr) {
          console.error('Error al eliminar de Cloudinary:', cloudErr);
        }
      }

      // Eliminar de la base de datos
      await db.query('DELETE FROM files WHERE id = $1', [id]);

      res.json({ success: true, message: 'Archivo eliminado' });
    } catch (err) {
      console.error('Error al eliminar archivo:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  return router;
};
