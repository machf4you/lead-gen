import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// In-memory jobs store
const jobs = [];

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: "ok"
  });
});

// POST URL endpoint
app.post('/api/url', (req, res) => {
  const { url } = req.body;
  const jobId = crypto.randomUUID();
  const newJob = {
    jobId: jobId,
    url: url,
    status: "Pending",
    fetchResult: null
  };
  jobs.push(newJob);

  // Processing pipeline progression
  setTimeout(async () => {
    newJob.status = "Fetching";

    try {
      let fetchUrl = url;
      if (!/^https?:\/\//i.test(fetchUrl)) {
        fetchUrl = 'http://' + fetchUrl;
      }
      const response = await fetch(fetchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow'
      });
      const html = await response.text();
      newJob.fetchResult = {
        success: true,
        httpStatus: response.status,
        finalUrl: response.url,
        htmlLength: html.length
      };
    } catch (error) {
      newJob.fetchResult = {
        success: false
      };
    }

    setTimeout(() => {
      newJob.status = "Analysing";
      setTimeout(() => {
        newJob.status = "Completed";
      }, 5000);
    }, 5000);
  }, 5000);

  res.json({
    jobId: jobId,
    received: true
  });
});

// GET jobs endpoint
app.get('/api/jobs', (req, res) => {
  res.json(jobs);
});

// Root check endpoint
app.get('/', (req, res) => {
  res.send('Lead Gen Backend is running.');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
