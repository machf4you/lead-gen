import 'dotenv/config';
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

// POST search endpoint (DataForSEO Integration)
app.post('/api/search', async (req, res) => {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    return res.status(400).json({
      error: "DataForSEO API credentials are not configured. Please set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in your environment."
    });
  }

  const { businessType, location } = req.body;
  if (!businessType || !location) {
    return res.status(400).json({
      error: "Business Type and Location are required."
    });
  }

  try {
    const auth = Buffer.from(`${login}:${password}`).toString('base64');
    const keyword = `${businessType} in ${location}`;

    const category = businessType.toLowerCase().trim().replace(/s$/, '').replace(/\s+/g, '_');
    const response = await fetch('https://api.dataforseo.com/v3/business_data/business_listings/search/live', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([
        {
          categories: [category],
          filters: [
            ["address_info.city", "=", location.trim()]
          ],
          limit: 20
        }
      ])
    });

    const data = await response.json();
    const task = data?.tasks?.[0];

    if (task?.status_code !== 20000) {
      return res.status(500).json({
        error: `DataForSEO API task failed: ${task?.status_message}`
      });
    }

    const items = task?.result?.[0]?.items || [];
    
    const businesses = items.map(item => ({
      name: item.title || "",
      website: item.website || "",
      phone: item.phone || "",
      address: item.address || "",
      rating: item.rating?.value || null
    }));

    res.json(businesses);
  } catch (error) {
    res.status(500).json({
      error: `Failed to retrieve businesses: ${error.message}`
    });
  }
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
