const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = function(db) {  // ✅ db se recibe como parámetro
  const router = express.Router();

  // Login
  router.post('/login', async (req, res) => {
    try {
      console.log('🔐 Login attempt received:', req.body);
      
      const { email, password } = req.body;
      
      // ✅ Verificar que db esté definido
      if (!db) {
        console.error('❌ ERROR: db is undefined in auth routes');
        return res.status(500).json({ error: 'Database connection error' });
      }

      // ✅ Verificar que la colección exista
      if (!db.collection) {
        console.error('❌ ERROR: db.collection is not a function');
        return res.status(500).json({ error: 'Database connection error' });
      }

      const user = await db.collection('users').findOne({ email });
      
      if (!user) {
        console.log('❌ User not found:', email);
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      
      if (!validPassword) {
        console.log('❌ Invalid password for user:', email);
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      console.log('✅ Login successful for user:', email);
      
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
      console.error('❌ Error in login route:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
