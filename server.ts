import express from 'express';
import path from 'path';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.post('/api/gemini/generateContent', async (req, res) => {
    try {
        let { model, contents, config, customApiKey } = req.body;
        
        let apiKey = customApiKey;
        if (!apiKey || apiKey.trim() === '') {
            apiKey = process.env.GEMINI_API_KEY;
        }

        if (!apiKey) {
            return res.status(401).json({ error: "No API key configured." });
        }
        
        if (model === 'gemini-3.1-pro-preview') model = 'gemini-2.5-pro';
        if (model === 'gemini-3-pro-preview') model = 'gemini-1.5-pro';
        if (model === 'gemini-3-flash-preview') model = 'gemini-1.5-flash';
        if (model === 'gemini-3.1-flash-lite-preview') model = 'gemini-2.5-flash';

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model,
            contents,
            config
        });
        
        res.json(response);
    } catch (e: any) {
        console.error("Server API Error:", e);
        res.status(500).json({ error: e.message || String(e), status: e.status });
    }
  });

  app.post('/api/gemini/generateImages', async (req, res) => {
    try {
        let { model, prompt, config, customApiKey } = req.body;
        
        let apiKey = customApiKey;
        if (!apiKey || apiKey.trim() === '') {
            apiKey = process.env.GEMINI_API_KEY;
        }

        if (!apiKey) {
            return res.status(401).json({ error: "No API key configured." });
        }
        
        if (model === 'gemini-3.1-flash-image-preview') model = 'imagen-4.0-generate-001';
        if (model === 'gemini-2.5-flash-image') model = 'imagen-4.0-generate-001';
        if (model === 'gemini-3-pro-image-preview') model = 'imagen-4.0-generate-001';
        if (model === 'gemini-1.5-pro') model = 'imagen-4.0-generate-001'; // fallback

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateImages({
            model: model || 'imagen-4.0-generate-001',
            prompt,
            config
        });
        
        res.json(response);
    } catch (e: any) {
        console.error("Server API Error:", e);
        res.status(500).json({ error: e.message || String(e), status: e.status });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
