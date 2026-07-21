import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: "ok"
  });
});

// POST URL endpoint
app.post('/api/url', (req, res) => {
  const { url } = req.body;
  res.json({
    received: true,
    url: url
  });
});

// Root check endpoint
app.get('/', (req, res) => {
  res.send('Lead Gen Backend is running.');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
