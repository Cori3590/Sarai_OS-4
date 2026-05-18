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
        
        if (model === 'gemini-2.0-flash-exp') model = 'gemini-2.0-flash-exp';
        if (model === 'gemini-1.5-pro') model = 'gemini-1.5-pro';
        if (model === 'gemini-1.5-flash') model = 'gemini-1.5-flash';
        if (model === 'gemini-2.5-pro') model = 'gemini-1.5-pro';
        if (model === 'gemini-2.5-flash') model = 'gemini-1.5-flash';

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
        
        // Gemini doesn't directly generate images in standard generateImages call yet. 
        // We map Gemini choices to the most compatible Imagen model internally.
        // If the user selects a Gemini model for images, they expect Gemini branding.
        let targetModel = 'imagen-3.0-generate-001';
        if (model && model.includes('flash')) targetModel = 'imagen-3.0-fast-generate-001';
        
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateImages({
            model: targetModel,
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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
