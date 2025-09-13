const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = (db) => {
  const router = require('express').Router();

  // Login
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await db.collection('users').findOne({ email });
      if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      // Generate token
      const token = jwt.sign(
        { 
          id: user._id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Verify token
  router.get('/verify', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
      
      // Verify user still exists
      const user = await db.collection('users').findOne({ 
        _id: decoded.id 
      });

      if (!user) {
        return res.status(401).json({ error: 'Usuario no existe' });
      }

      res.json({
        valid: true,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });

    } catch (error) {
      res.status(401).json({ error: 'Token inválido' });
    }
  });

  return router;
};