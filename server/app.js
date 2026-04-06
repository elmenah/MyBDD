require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDB } = require('./db');
const uploadRoutes = require('./routes/upload');
const filesRoutes = require('./routes/files');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173']
  : ['http://localhost:5173'];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Inicializar DB y arrancar servidor
const db = initDB();

// Auth simple
const APP_PASSWORD = process.env.APP_PASSWORD || '';

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!APP_PASSWORD) return res.json({ success: true, token: 'open' });
  if (password === APP_PASSWORD) {
    const token = Buffer.from(`${Date.now()}:${APP_PASSWORD}`).toString('base64');
    return res.json({ success: true, token });
  }
  res.status(401).json({ error: 'Contraseña incorrecta' });
});

function authMiddleware(req, res, next) {
  if (!APP_PASSWORD) return next();
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString();
    if (decoded.endsWith(`:${APP_PASSWORD}`)) return next();
  } catch {}
  res.status(401).json({ error: 'No autorizado' });
}

// Rutas API (protegidas)
app.use('/api', authMiddleware, uploadRoutes(db));
app.use('/api', authMiddleware, filesRoutes(db));

// Servir frontend en producción
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('===========================================');
  console.log('  🗂️  MyBDD - Galería Personal');
  console.log('===========================================');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log('===========================================');
  console.log('');
});
