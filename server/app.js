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

// Rutas API
app.use('/api', uploadRoutes(db));
app.use('/api', filesRoutes(db));

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
