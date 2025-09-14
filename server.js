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
let dbClient = null;

// ✅ ENDPOINT TEMPORAL DE LOGIN - Funciona inmediatamente
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login endpoint llamado');
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    // Si la base de datos aún no está conectada, usar login temporal
    if (!db) {
      console.log('⏳ DB no conectada aún, usando verificación temporal');
      
      // Login hardcodeado para admin (solo para testing)
      if (email === 'admin@fiestadelafrutilla.com' && password === 'admin123') {
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
          { userId: 'admin-id', email: email, role: 'admin' },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        return res.json({
          token,
          user: {
            id: 'admin-id',
            email: email,
            name: 'Administrador',
            role: 'admin'
          }
        });
      }
      
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    // Si la base de datos ya está conectada, usar la real
    console.log('✅ Usando base de datos real para login');
    const user = await db.collection('users').findOne({ email });
    
    if (!user) {
      console.log('❌ Usuario no encontrado:', email);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const bcrypt = require('bcryptjs');
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      console.log('❌ Contraseña incorrecta para:', email);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('✅ Login exitoso para:', email);
    
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ error: error.message });
  }
});

// Función para configurar las rutas DESPUÉS de conectar a MongoDB
function setupRoutes() {
  console.log('🔧 Configurando rutas con db disponible...');
  console.log('db está definido:', !!db);
  
  if (!db) {
    console.error('❌ ERROR: db no está disponible para configurar rutas');
    return;
  }

  try {
    // Routes que requieren la base de datos
    app.use('/api/auth', require('./routes/auth')(db));
    app.use('/api/posts', require('./routes/posts')(db));
    app.use('/api/config', require('./routes/config')(db));
    
    console.log('✅ Rutas configuradas correctamente');
    console.log('📋 Endpoints disponibles: /api/auth, /api/posts, /api/config');
    
  } catch (error) {
    console.error('❌ Error configurando rutas:', error);
  }
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
      environment: process.env.NODE_ENV,
      message: db ? 'Base de datos conectada' : 'Conectando a base de datos...'
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
    currentTime: new Date().toISOString(),
    status: db ? 'DB Connected' : 'DB Connecting'
  });
});

// Serve admin panel
app.use(express.static('public'));
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    requestedUrl: req.originalUrl,
    availableEndpoints: [
      'POST /api/auth/login',
      'GET /api/health',
      'GET /api/debug',
      'GET /admin'
    ]
  });
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
    console.log('URI:', MONGODB_URI.replace(/:[^:]*@/, ':****@'));
    
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000
    });
    
    await client.connect();
    db = client.db('fiestadelafrutilla');
    dbClient = client;
    
    console.log('✅ Conectado a MongoDB Atlas');
    
    // Configurar rutas AHORA que db está disponible
    setupRoutes();
    
    // Crear colecciones iniciales
    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('posts').createIndex({ slug: 1 }, { unique: true });
      console.log('✅ Índices creados/verificados');
    } catch (indexError) {
      console.log('ℹ️ Índices ya existen:', indexError.message);
    }
    
    // Verificar usuario admin
    try {
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
    } catch (userError) {
      console.log('⚠️ Error verificando usuario admin:', userError.message);
    }
    
    return client;
    
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

// Start server
async function startServer() {
  console.log('🚀 Iniciando servidor...');
  console.log('🌐 Entorno:', process.env.NODE_ENV || 'development');
  console.log('📍 Puerto:', PORT);
  
  // Iniciar servidor primero
  const server = app.listen(PORT, () => {
    console.log(`🎯 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`👨‍💻 Panel admin: http://localhost:${PORT}/admin`);
    console.log(`🌐 URL Render: https://fiestadelafrutilla-backend.onrender.com`);
  });
  
  // Luego conectar a MongoDB (pero no bloquear el inicio del servidor)
  connectToMongo().then(() => {
    console.log('✅ Conexión a MongoDB completada');
  }).catch(error => {
    console.error('❌ Error en conexión MongoDB:', error);
  });
  
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  if (dbClient) {
    await dbClient.close();
    console.log('✅ MongoDB connection closed');
  }
  process.exit(0);
});

startServer();
