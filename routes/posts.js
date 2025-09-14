const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  // Get all posts
  router.get('/', async (req, res) => {
    try {
      const posts = await db.collection('posts').find().sort({ createdAt: -1 }).toArray();
      res.json(posts);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create post
  router.post('/', async (req, res) => {
    try {
      const post = {
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection('posts').insertOne(post);
      res.json({ ...post, _id: result.insertedId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
