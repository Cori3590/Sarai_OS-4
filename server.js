import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Path to the built static files
const staticPath = path.join(__dirname, 'dist');

// Serve static files
app.use(express.static(staticPath));

// Fallback to index.html for SPA routing
app.get('*all', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'), (err) => {
    if (err) {
      res.status(500).send(err);
    }
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port} at 0.0.0.0`);
});
