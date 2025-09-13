require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://DAMIANRAMIREZ:DeadPool213%3F%21@ac-dmmrxxl-shard-00-00.yuvgucy.mongodb.net/blog?retryWrites=true&w=majority';

let dbClient;
let db;

async function connectToMongo() {
  try {
    dbClient = new MongoClient(MONGODB_URI);
    await dbClient.connect();
    db = dbClient.db('fiestadelafrutilla');
    console.log('✅ Conectado a MongoDB Atlas');
    
    // Crear colecciones iniciales
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('posts').createIndex({ slug: 1 }, { unique: true });
    
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
    }
    
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
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
      timestamp: new Date().toISOString()
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
  await connectToMongo();
  
  app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📊 Panel admin: http://localhost:${PORT}/admin`);
  });
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  if (dbClient) {
    await dbClient.close();
  }
  process.exit(0);
});