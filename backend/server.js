require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimiter = require('./security/rateLimiter');
const verifyJWT = require('./auth/verifyJWT');
const geminiClient = require('./ai/geminiClient');
const memoryService = require('./memory/memoryService');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(rateLimiter);

// Health Check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// --- AI Routes ---
app.post('/api/ai/validate-key', verifyJWT, async (req, res) => {
  try {
    const result = await geminiClient.validateKey(req.body.apiKey);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/ai/generate', verifyJWT, async (req, res) => {
  try {
    // BYOK: API Key passed in header or body, handled securely
    const apiKey = req.headers['x-gemini-api-key'];
    const response = await geminiClient.generateContent(apiKey, req.body);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/stream', verifyJWT, async (req, res) => {
  try {
    const apiKey = req.headers['x-gemini-api-key'];
    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await geminiClient.streamContent(apiKey, req.body, res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).end();
  }
});

app.post('/api/ai/generate-images', verifyJWT, async (req, res) => {
    try {
        const apiKey = req.headers['x-gemini-api-key'];
        const response = await geminiClient.generateImages(apiKey, req.body);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Memory Routes ---
app.post('/api/memory/extract', verifyJWT, async (req, res) => {
    try {
        const apiKey = req.headers['x-gemini-api-key'];
        const { userId, userText, aiText, projectId } = req.body;
        await memoryService.extractAndSave(userId, userText, aiText, projectId, apiKey);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// --- Search Routes ---
app.post('/api/search', verifyJWT, async (req, res) => {
  try {
    const { query, limit } = req.body;
    const apiKey = "sk-6ead70c96fad423c89aab5b6d4e85b9f"; // LangSearch API Key

    const response = await fetch("https://api.langsearch.com/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({ query, count: limit || 10 })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("LangSearch API Error:", response.status, errText);
      throw new Error(`LangSearch API Error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Search Proxy Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend Server running on port ${PORT}`);
});