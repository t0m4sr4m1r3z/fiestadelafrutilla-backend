module.exports = (db) => {
  const router = require('express').Router();

  // Get all posts
  router.get('/', async (req, res) => {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const query = status ? { status } : {};
      
      const posts = await db.collection('posts')
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .toArray();

      const total = await db.collection('posts').countDocuments(query);

      res.json({
        posts,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total
      });

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
        updatedAt: new Date(),
        views: 0,
        likes: 0
      };

      const result = await db.collection('posts').insertOne(post);
      const newPost = await db.collection('posts').findOne({ _id: result.insertedId });

      res.status(201).json(newPost);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update post
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await db.collection('posts').updateOne(
        { _id: id },
        { 
          $set: {
            ...req.body,
            updatedAt: new Date()
          } 
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Post no encontrado' });
      }

      const updatedPost = await db.collection('posts').findOne({ _id: id });
      res.json(updatedPost);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete post
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await db.collection('posts').deleteOne({ _id: id });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Post no encontrado' });
      }

      res.json({ message: 'Post eliminado correctamente' });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};