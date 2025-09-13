require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

let dbClient;
let db;

async function connectToMongo() {
  try {
    console.log('🔗 Intentando conectar a MongoDB...');
    console.log('Node version:', process.version);
    
    // Conexión compatible con versiones anteriores
    dbClient = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 15000
    });
    
    await dbClient.connect();
    db = dbClient.db('fiestadelafrutilla');
    console.log('✅ Conectado a MongoDB Atlas');
    
    // Crear colecciones iniciales
    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('posts').createIndex({ slug: 1 }, { unique: true });
      console.log('✅ Índices creados');
    } catch (indexError) {
      console.log('ℹ️ Índices ya existen o error menor:', indexError.message);
    }
    
    // Crear usuario admin inicial si no existe
    const existingAdmin = await db.collection('users').findOne({ email: 'admin@fiestadelafrutilla.com' });
    if (!existingAdmin) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 12);
      await db.collection('users').insertOne({
        email: 'admin@fiestadelafrutilla.com',
        password: hashedPassword,
        name: 'Administrador',
        role: 'admin',
        createdAt: new Date()
      });
      console.log('👤 Usuario admin creado: admin@fiestadelafrutilla.com / admin123');
    } else {
      console.log('👤 Usuario admin ya existe');
    }
    
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

// Middleware
app.use(cors({
  origin: [
    'https://fiestadelafrutilla.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Routes
app.use('/api/auth', require('./routes/auth')(db));
app.use('/api/posts', require('./routes/posts')(db));
app.use('/api/config', require('./routes/config')(db));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString(),
      nodeVersion: process.version
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Serve admin panel (si existe)
app.use(express.static('public'));
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
async function startServer() {
  console.log('🚀 Iniciando servidor...');
  console.log('🌐 Entorno:', process.env.NODE_ENV || 'development');
  
  await connectToMongo();
  
  app.listen(PORT, () => {
    console.log(`🎯 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`👨‍💻 Panel admin: http://localhost:${PORT}/admin`);
  });
}

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

startServer();
