require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware que no depende de la base de datos
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

// Debug middleware
app.use((req, res, next) => {
  console.log('📨 Request:', req.method, req.url, new Date().toISOString());
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('   Body:', JSON.stringify(req.body).substring(0, 200) + '...');
  }
  next();
});

// Variable global para la base de datos
let db = null;

// Función para configurar las rutas DESPUÉS de conectar a MongoDB
function setupRoutes() {
  console.log('🔧 Configurando rutas con db disponible...');
  console.log('db está definido:', !!db);
  
  if (!db) {
    console.error('❌ ERROR: db no está disponible para configurar rutas');
    return;
  }

  // Routes que requieren la base de datos
  app.use('/api/auth', require('./routes/auth')(db));
  app.use('/api/posts', require('./routes/posts')(db));
  app.use('/api/config', require('./routes/config')(db));

  console.log('✅ Rutas configuradas correctamente');
}

// Health check que no requiere db inicialmente
app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = db ? 'connected' : 'connecting';
    res.json({ 
      status: 'OK', 
      database: dbStatus,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Serve admin panel
app.use(express.static('public'));
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI no está definida en las variables de entorno');
  process.exit(1);
}

async function connectToMongo() {
  try {
    console.log('🔗 Intentando conectar a MongoDB...');
    
    const dbClient = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 15000
    });
    
    await dbClient.connect();
    db = dbClient.db('fiestadelafrutilla');
    console.log('✅ Conectado a MongoDB Atlas');
    
    // Configurar rutas AHORA que db está disponible
    setupRoutes();
    
    // Crear colecciones iniciales
    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('posts').createIndex({ slug: 1 }, { unique: true });
      console.log('✅ Índices creados');
    } catch (indexError) {
      console.log('ℹ️ Índices ya existen:', indexError.message);
    }
    
    // Crear usuario admin si no existe
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
      console.log('👤 Usuario admin creado');
    } else {
      console.log('👤 Usuario admin ya existe');
    }
    
    return dbClient;
    
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
}

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
async function startServer() {
  console.log('🚀 Iniciando servidor...');
  
  // Iniciar servidor primero
  const server = app.listen(PORT, () => {
    console.log(`🎯 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`👨‍💻 Panel admin: http://localhost:${PORT}/admin`);
  });
  
  // Luego conectar a MongoDB
  await connectToMongo();
  
  return server;
}

// Manejo de errores
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

startServer();
