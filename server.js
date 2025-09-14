require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Debug: Mostrar variables de entorno (sin valores sensibles)
console.log('🔍 Debug - Variables de entorno:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('JWT_SECRET definido:', !!process.env.JWT_SECRET);
console.log('MONGODB_URI definido:', !!process.env.MONGODB_URI);

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI no está definida en las variables de entorno');
  process.exit(1);
}

// Debug: Mostrar URI segura (ocultando contraseña)
const safeUri = MONGODB_URI.replace(/:[^:]*@/, ':****@');
console.log('🔗 URI de MongoDB:', safeUri);

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
    
    // Debug: Listar colecciones existentes
    const collections = await db.listCollections().toArray();
    console.log('📊 Colecciones en la base de datos:');
    collections.forEach(col => console.log('   -', col.name));
    
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

// Debug middleware para todas las requests
app.use((req, res, next) => {
  console.log('📨 Request:', req.method, req.url, new Date().toISOString());
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('   Body:', JSON.stringify(req.body).substring(0, 200) + '...');
  }
  next();
});

// Verificar si la carpeta routes existe
const routesPath = path.join(__dirname, 'routes');
console.log('📁 Ruta de routes:', routesPath);
console.log('📁 Routes existe:', fs.existsSync(routesPath));

if (fs.existsSync(routesPath)) {
  console.log('📋 Archivos en routes:');
  try {
    const files = fs.readdirSync(routesPath);
    files.forEach(file => console.log('   -', file));
    
    // Routes normales
    app.use('/api/auth', require('./routes/auth')(db));
    app.use('/api/posts', require('./routes/posts')(db));
    app.use('/api/config', require('./routes/config')(db));
    
  } catch (error) {
    console.error('❌ Error leyendo carpeta routes:', error.message);
  }
} else {
  console.warn('⚠️  Carpeta routes no encontrada, creando endpoints temporales...');
}

// ✅ ENDPOINTS TEMPORALES PARA DEBUG - Mientras se crean las rutas
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body);
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }
    
    // Simular login exitoso para admin
    if (email === 'admin@fiestadelafrutilla.com' && password === 'admin123') {
      console.log('✅ Login exitoso para admin');
      return res.json({
        token: 'jwt-token-simulado-para-debug',
        user: {
          id: 'admin-id',
          email: 'admin@fiestadelafrutilla.com',
          name: 'Administrador',
          role: 'admin'
        },
        message: 'Login exitoso (modo debug)'
      });
    }
    
    // Si hay base de datos, buscar usuario real
    if (db) {
      const user = await db.collection('users').findOne({ email });
      if (user) {
        const bcrypt = require('bcryptjs');
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (validPassword) {
          const jwt = require('jsonwebtoken');
          const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '24h' }
          );
          
          return res.json({
            token,
            user: {
              id: user._id,
              email: user.email,
              name: user.name,
              role: user.role
            }
          });
        }
      }
    }
    
    res.status(401).json({ error: 'Credenciales inválidas' });
    
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check mejorado
app.get('/api/health', async (req, res) => {
  try {
    let dbStatus = 'disconnected';
    if (db) {
      await db.command({ ping: 1 });
      dbStatus = 'connected';
    }
    
    res.json({ 
      status: 'OK', 
      database: dbStatus,
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV,
      routesAvailable: fs.existsSync(routesPath)
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Endpoint de información del sistema
app.get('/api/debug', (req, res) => {
  res.json({
    nodeVersion: process.version,
    environment: process.env.NODE_ENV,
    port: process.env.PORT,
    hasMongoDB: !!db,
    routesFolderExists: fs.existsSync(routesPath),
    currentTime: new Date().toISOString(),
    memoryUsage: process.memoryUsage()
  });
});

// Serve admin panel (si existe)
app.use(express.static('public'));
app.get('/admin*', (req, res) => {
  console.log('📋 Solicitud panel admin:', req.url);
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  console.log('❌ Endpoint no encontrado:', req.originalUrl);
  res.status(404).json({ 
    error: 'Endpoint not found',
    requestedUrl: req.originalUrl,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/debug', 
      'POST /api/auth/login',
      'GET /admin'
    ]
  });
});

// Start server
async function startServer() {
  console.log('🚀 Iniciando servidor...');
  console.log('🌐 Entorno:', process.env.NODE_ENV || 'development');
  
  await connectToMongo();
  
  app.listen(PORT, () => {
    console.log(`🎯 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🐛 Debug info: http://localhost:${PORT}/api/debug`);
    console.log(`👨‍💻 Panel admin: http://localhost:${PORT}/admin`);
    console.log(`🌐 URL Render: https://fiestadelafrutilla-backend.onrender.com`);
  });
}

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

startServer();
