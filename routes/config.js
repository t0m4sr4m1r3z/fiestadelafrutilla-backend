module.exports = (db) => {
  const router = require('express').Router();

  // Get config
  router.get('/', async (req, res) => {
    try {
      let config = await db.collection('config').findOne({});
      
      if (!config) {
        // Create default config
        config = {
          siteTitle: 'Fiesta de la Frutilla',
          siteDescription: 'La mejor fiesta de frutillas de la región',
          adminEmail: 'admin@fiestadelafrutilla.com',
          socialMedia: {},
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await db.collection('config').insertOne(config);
      }

      res.json(config);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update config
  router.put('/', async (req, res) => {
    try {
      const config = await db.collection('config').findOneAndUpdate(
        {},
        { 
          $set: {
            ...req.body,
            updatedAt: new Date()
          } 
        },
        { returnDocument: 'after', upsert: true }
      );

      res.json(config);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};