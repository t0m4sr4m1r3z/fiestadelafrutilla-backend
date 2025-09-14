const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  // Get config
  router.get('/', async (req, res) => {
    try {
      const config = await db.collection('config').findOne({});
      res.json(config || {});
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update config
  router.put('/', async (req, res) => {
    try {
      const result = await db.collection('config').updateOne(
        {},
        { $set: { ...req.body, updatedAt: new Date() } },
        { upsert: true }
      );
      res.json({ message: 'Configuración actualizada', result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
