import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

// Helper to detect temporary/interstitial placeholder titles
function isPlaceholderTitle(title) {
  if (!title) return true;
  const t = title.toLowerCase().trim();
  const placeholders = [
    'just a moment',
    'loading',
    'please wait',
    'checking your browser',
    'checking your browser before accessing',
    'attention required',
    'one more step',
    'security check',
    'ddos guard',
    'cloudflare'
  ];
  return placeholders.some(p => t.includes(p));
}

// Helper to fetch page content using a headless browser with network/DOM stability wait
async function fetchPageWithPuppeteer(targetUrl) {
  console.log(`[Puppeteer Scraper] Launching browser to fetch: ${targetUrl}`);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const response = await page.goto(targetUrl, {
      waitUntil: ['load', 'networkidle0'],
      timeout: 15000
    });
    
    // Wait for DOM stability / dynamic javascript challenge to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const html = await page.content();
    const finalUrl = page.url();
    const status = response ? response.status() : 200;
    
    return {
      success: true,
      html,
      finalUrl,
      status
    };
  } catch (err) {
    console.error(`[Puppeteer Scraper Error]`, err);
    return { success: false, error: err.message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}


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

  const { businessType, location, searchMode } = req.body;
  if (!businessType || !location) {
    return res.status(400).json({
      error: "Business Type and Location are required."
    });
  }

  try {
    const auth = Buffer.from(`${login}:${password}`).toString('base64');
    
    if (searchMode === 'organic') {
      const searchPhrase = `${businessType} ${location}`;
      let organicResults = [];
      const seenUrls = new Set();
      const maxPages = 5;
      for (let pageNum = 0; pageNum < maxPages; pageNum++) {
        if (organicResults.length >= 50) break;

        const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([
            {
              keyword: searchPhrase,
              language_name: "English",
              location_name: "United Kingdom",
              limit: 20,
              offset: pageNum * 10
            }
          ])
        });

        const data = await response.json();
        const task = data?.tasks?.[0];

        if (task?.status_code !== 20000) {
          if (pageNum === 0) {
            return res.status(500).json({
              error: `DataForSEO API task failed: ${task?.status_message}`
            });
          }
          break;
        }

        const items = task?.result?.[0]?.items || [];
        const pageOrganic = items.filter(item => item.type === 'organic');

        if (pageOrganic.length === 0) {
          break;
        }

        let newItemsAdded = 0;
        for (const item of pageOrganic) {
          if (organicResults.length >= 50) break;

          const url = item.url || "";
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            organicResults.push({
              rank: organicResults.length + 1,
              title: item.title || "",
              domain: item.domain || "",
              url: url,
              description: item.description || ""
            });
            newItemsAdded++;
          }
        }

        if (newItemsAdded === 0) {
          break;
        }
      }

      return res.json(organicResults);
    } else {
      const category = businessType.toLowerCase().trim().replace(/s$/, '').replace(/\s+/g, '_');
      const normalizedLocation = location.trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

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
              ["address_info.city", "=", normalizedLocation]
            ],
            limit: 50
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
      const businesses = items.map((item, index) => ({
        name: item.title || "",
        website: item.url || "",
        phone: item.phone || "",
        address: item.address || "",
        rating: item.rating?.value || null,
        rank: index + 1
      }));

      return res.json(businesses);
    }
  } catch (error) {
    res.status(500).json({
      error: `Failed to retrieve search results: ${error.message}`
    });
  }
});

function getDomain(urlStr) {
  if (!urlStr) return '';
  try {
    const urlObj = new URL(urlStr);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    return urlStr.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].split('?')[0];
  }
}

function getExactHost(urlStr) {
  if (!urlStr) return '';
  try {
    const urlObj = new URL(urlStr);
    return urlObj.hostname;
  } catch (e) {
    return urlStr.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
  }
}

function extractBusinessName(title, h1) {
  let candidate = '';
  if (title && title !== 'Not Found' && title !== 'Loading...') {
    const parts = title.split(/[|:-]/);
    const cleanedParts = parts.map(p => p.trim()).filter(Boolean);
    if (cleanedParts.length > 0) {
      candidate = cleanedParts[0];
    }
  }
  if (!candidate && h1 && h1 !== 'Not Found' && h1 !== 'Loading...') {
    candidate = h1.trim();
  }
  if (candidate) {
    // Strip common legal suffixes
    candidate = candidate.replace(/\b(Ltd|Limited|LLP|Inc|Co|Plc|Group|Services|Solicitors|Lawyers)\b/gi, '').trim();
  }
  return candidate || '';
}

function calculateMatchScore(candidate, targetDomain, html, extractedBusinessName, searchLocation) {
  let score = 0;
  let reasons = [];

  // 1. Website Domain Match
  if (candidate.url) {
    const candidateDomain = getDomain(candidate.url);
    if (candidateDomain && targetDomain && candidateDomain.toLowerCase() === targetDomain.toLowerCase()) {
      score += 150;
      reasons.push(`Exact domain match (${candidateDomain})`);
    } else if (candidate.url.toLowerCase().includes(targetDomain.toLowerCase())) {
      score += 100;
      reasons.push(`Partial domain match in URL`);
    }
  }

  // 2. Business Name Similarity
  if (candidate.title && extractedBusinessName) {
    const candTitleClean = candidate.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const extNameClean = extractedBusinessName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (candTitleClean === extNameClean) {
      score += 80;
      reasons.push(`Exact name match (${candidate.title})`);
    } else if (candTitleClean.includes(extNameClean) || extNameClean.includes(candTitleClean)) {
      score += 40;
      reasons.push(`Partial name match (${candidate.title} vs ${extractedBusinessName})`);
    }
  }

  // 3. Phone Number Match
  if (candidate.phone && html) {
    const cleanCandPhone = candidate.phone.replace(/[^0-9]/g, '');
    const cleanHtml = html.replace(/[^0-9]/g, '');
    if (cleanCandPhone.length > 5 && cleanHtml.includes(cleanCandPhone)) {
      score += 100;
      reasons.push(`Phone number match (${candidate.phone})`);
    }
  }

  // 4. Address/Postcode Match
  if (candidate.address_info?.zip && html) {
    const zip = candidate.address_info.zip.trim();
    const cleanZip = zip.replace(/\s+/g, '').toLowerCase();
    const cleanHtml = html.toLowerCase().replace(/\s+/g, '');
    if (zip.length >= 3 && (html.toLowerCase().includes(zip.toLowerCase()) || cleanHtml.includes(cleanZip))) {
      score += 100;
      reasons.push(`Postcode match (${zip})`);
    }
  }

  // 5. Search Location Match
  if (searchLocation && searchLocation.toLowerCase() !== 'anywhere' && searchLocation.toLowerCase() !== 'any') {
    const city = candidate.address_info?.city;
    if (city && city.toLowerCase() === searchLocation.toLowerCase()) {
      score += 120;
      reasons.push(`Search location city match (${city})`);
    } else if (candidate.address && candidate.address.toLowerCase().includes(searchLocation.toLowerCase())) {
      score += 80;
      reasons.push(`Search location in address`);
    }
  }

  // 6. Review Count Tie-Breaker
  if (candidate.rating?.votes_count) {
    const tieBreaker = Math.min(candidate.rating.votes_count / 1000, 0.999);
    score += tieBreaker;
  }

  return { score, reasons };
}

const performGbpMatching = async (targetUrl, html, title, h1Text, searchLocation) => {
  const cleanDomain = getDomain(targetUrl);
  const exactHost = getExactHost(targetUrl);
  const businessName = extractBusinessName(title, h1Text) || cleanDomain.split('.')[0];

  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  let candidates = [];
  let methodUsed = '';

  // Step 1: Try exact domain matches (exactHost, then cleanDomain)
  try {
    const response = await fetch('https://api.dataforseo.com/v3/business_data/business_listings/search/live', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ filters: [["domain", "=", exactHost]], limit: 10 }])
    });
    if (response.ok) {
      const resData = await response.json();
      candidates = resData?.tasks?.[0]?.result?.[0]?.items || [];
      if (candidates.length > 0) methodUsed = 'Exact Host domain match';
    }
  } catch (e) {
    console.error('Exact host lookup failed:', e);
  }

  if (candidates.length === 0 && cleanDomain !== exactHost) {
    try {
      const response = await fetch('https://api.dataforseo.com/v3/business_data/business_listings/search/live', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ filters: [["domain", "=", cleanDomain]], limit: 10 }])
      });
      if (response.ok) {
        const resData = await response.json();
        candidates = resData?.tasks?.[0]?.result?.[0]?.items || [];
        if (candidates.length > 0) methodUsed = 'Clean domain match';
      }
    } catch (e) {
      console.error('Clean domain lookup failed:', e);
    }
  }

  // Step 2: Search using business name if no match is found
  if (candidates.length === 0 && businessName) {
    try {
      const response = await fetch('https://api.dataforseo.com/v3/business_data/business_listings/search/live', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ filters: [["title", "like", `%${businessName}%`]], limit: 10 }])
      });
      if (response.ok) {
        const resData = await response.json();
        candidates = resData?.tasks?.[0]?.result?.[0]?.items || [];
        if (candidates.length > 0) methodUsed = 'Business name search';
      }
    } catch (e) {
      console.error('Business name lookup failed:', e);
    }
  }

  // Step 3 & 4: Compare candidates and score them
  let bestCandidates = [];
  let bestScore = 0;
  let bestReasons = [];

  for (const candidate of candidates) {
    const { score, reasons } = calculateMatchScore(candidate, cleanDomain, html, businessName, searchLocation);
    if (score > bestScore) {
      bestScore = score;
      bestCandidates = [candidate];
      bestReasons = reasons;
    } else if (Math.abs(score - bestScore) < 0.0001 && score > 0) {
      bestCandidates.push(candidate);
    }
  }

  let gbp = {
    status: 'Not Found',
    businessName: 'Not Found',
    primaryCategory: 'Not Found',
    rating: 'Not Found',
    reviewCount: 'Not Found',
    websiteUrl: 'Not Found',
    phoneNumber: 'Not Found',
    address: 'Not Found'
  };

  if (bestScore >= 50 && bestCandidates.length === 1) {
    const bestCandidate = bestCandidates[0];
    gbp = {
      status: 'Found',
      businessName: bestCandidate.title || 'Not Found',
      primaryCategory: bestCandidate.category || 'Not Found',
      rating: bestCandidate.rating?.value !== undefined && bestCandidate.rating?.value !== null ? bestCandidate.rating.value : 'Not Found',
      reviewCount: bestCandidate.rating?.votes_count !== undefined && bestCandidate.rating?.votes_count !== null ? bestCandidate.rating.votes_count : 'Not Found',
      websiteUrl: bestCandidate.url || 'Not Found',
      phoneNumber: bestCandidate.phone || 'Not Found',
      address: bestCandidate.address || 'Not Found'
    };
  } else if (bestScore >= 50 && bestCandidates.length > 1) {
    gbp = {
      status: 'Multiple Matches',
      businessName: 'Multiple Matches',
      primaryCategory: 'Multiple Matches',
      rating: 'Multiple Matches',
      reviewCount: 'Multiple Matches',
      websiteUrl: 'Multiple Matches',
      phoneNumber: 'Multiple Matches',
      address: 'Multiple Matches'
    };
  }

  // Debug logging as required
  console.log(`[GBP Match Debug] Domain searched: ${cleanDomain}`);
  console.log(`[GBP Match Debug] Business name searched: "${businessName}"`);
  console.log(`[GBP Match Debug] Method used: ${methodUsed || 'None'}`);
  console.log(`[GBP Match Debug] Number of candidates returned: ${candidates.length}`);
  if (bestScore >= 50) {
    if (bestCandidates.length === 1) {
      console.log(`[GBP Match Debug] Selected profile: "${bestCandidates[0].title}" (Score: ${bestScore}). Reasons: ${bestReasons.join(', ')}`);
    } else {
      console.log(`[GBP Match Debug] Multiple matches qualified with score ${bestScore}.`);
    }
  } else {
    console.log(`[GBP Match Debug] No profile qualified (Max Score: ${bestScore}).`);
  }

  return gbp;
};

function getOpportunityScoreAndReasons(health, gbp, rank) {
  let score = 0;
  const reasonsList = [];

  // 1. Technical Health (Max 15 points)
  if (health.statusCode !== 200 && health.statusCode !== 0) {
    score += 15;
    reasonsList.push({ points: 15, text: `Non-200 HTTP response code (${health.statusCode}) indicates server errors` });
  } else if (health.statusCode === 0) {
    score += 15;
    reasonsList.push({ points: 15, text: "Website connection failed or timed out" });
  }

  if (!health.isHttps) {
    score += 8;
    reasonsList.push({ points: 8, text: "Website lacks HTTPS encryption, showing security warnings" });
  }

  if (!health.indexable) {
    score += 7;
    reasonsList.push({ points: 7, text: "Page is blocked from indexation by noindex tags" });
  }

  // 2. Google Business Profile Quality (Max 20 points)
  if (!gbp || gbp.status === 'Not Found') {
    score += 20;
    reasonsList.push({ points: 20, text: "No Google Business Profile was detected for the business" });
  } else if (gbp.status === 'Multiple Matches') {
    score += 10;
    reasonsList.push({ points: 10, text: "Multiple matching business profiles found, causing listing confusion" });
  } else if (gbp.status === 'Found') {
    const ratingVal = parseFloat(gbp.rating);
    const votesCount = parseInt(gbp.reviewCount, 10);
    
    if (!isNaN(ratingVal) && ratingVal < 4.0) {
      score += 10;
      reasonsList.push({ points: 10, text: `Google Business Profile rating is low (${ratingVal} stars)` });
    } else if (!isNaN(votesCount) && votesCount < 30) {
      score += 10;
      reasonsList.push({ points: 10, text: `Google Business Profile has a low review count (${votesCount} reviews)` });
    }
  }

  // 3. Organic Ranking (Max 15 points)
  const rankNum = parseInt(rank, 10);
  if (isNaN(rankNum) || rankNum <= 0) {
    score += 15;
    reasonsList.push({ points: 15, text: "Organic search ranking position is not in the top 50" });
  } else if (rankNum > 20) {
    score += 15;
    reasonsList.push({ points: 15, text: `Organic ranking position (#${rankNum}) is deep on pages 3-5` });
  } else if (rankNum > 10) {
    score += 10;
    reasonsList.push({ points: 10, text: `Organic ranking position (#${rankNum}) is on page 2` });
  } else if (rankNum > 3) {
    score += 5;
    reasonsList.push({ points: 5, text: `Organic ranking position (#${rankNum}) is on page 1 but outside the top 3` });
  }

  // 4. Metadata (Max 20 points)
  if (!health.titlePresent || health.titleLength === 0) {
    score += 10;
    reasonsList.push({ points: 10, text: "HTML meta title tag is missing" });
  } else if (health.titleLength < 50 || health.titleLength > 60) {
    score += 4;
    reasonsList.push({ points: 4, text: `HTML meta title length (${health.titleLength} chars) is outside optimal 50-60 range` });
  }

  if (!health.descriptionPresent || health.descriptionLength === 0) {
    score += 10;
    reasonsList.push({ points: 10, text: "HTML meta description tag is missing" });
  } else if (health.descriptionLength < 120 || health.descriptionLength > 160) {
    score += 4;
    reasonsList.push({ points: 4, text: `HTML meta description length (${health.descriptionLength} chars) is outside optimal 120-160 range` });
  }

  // 5. Heading Structure (Max 10 points)
  if (!health.h1Present || health.h1Count === 0) {
    score += 10;
    reasonsList.push({ points: 10, text: "First H1 heading tag is missing" });
  } else if (health.h1Count > 1) {
    score += 4;
    reasonsList.push({ points: 4, text: `Duplicate H1 heading tags found (${health.h1Count} tags)` });
  }

  // 6. Content Depth (Max 10 points)
  if (health.wordCount < 300) {
    score += 10;
    reasonsList.push({ points: 10, text: `Page content is thin (${health.wordCount} words, recommend 600+)` });
  } else if (health.wordCount < 600) {
    score += 5;
    reasonsList.push({ points: 5, text: `Page content is moderate (${health.wordCount} words, recommend 600+)` });
  }

  // 7. Internal & External Linking (Max 10 points)
  if (health.internalLinksCount < 5) {
    score += 5;
    reasonsList.push({ points: 5, text: `Low internal linking count (${health.internalLinksCount} links)` });
  }
  if (health.externalLinksCount < 1) {
    score += 5;
    reasonsList.push({ points: 5, text: "Low external linking count (0 links)" });
  }

  // Ensure score is capped at 100
  score = Math.min(score, 100);

  // Determine Opportunity Band
  let band = 'Low';
  if (score >= 80) {
    band = 'Very High';
  } else if (score >= 60) {
    band = 'High';
  } else if (score >= 30) {
    band = 'Moderate';
  }

  const topReasons = reasonsList
    .sort((a, b) => b.points - a.points)
    .slice(0, 5)
    .map(r => r.text);

  while (topReasons.length < 5) {
    topReasons.push("Website has strong technical indicators in other areas");
  }

  return {
    score,
    band,
    reasons: topReasons
  };
}

function getPriorityRating(health, gbp, rank) {
  let points = 0;

  // 1. Business Size / Online Footprint (Max 40 points)
  if (gbp) {
    if (gbp.status === 'Multiple Matches') {
      points += 30; // Automatically high priority for multi-location firms
    } else if (gbp.status === 'Found') {
      const reviews = parseInt(gbp.reviewCount, 10);
      if (!isNaN(reviews)) {
        if (reviews > 500) points += 25;
        else if (reviews >= 100) points += 15;
        else if (reviews >= 30) points += 10;
        else if (reviews >= 1) points += 5;
      }
    }
  }

  // 2. Website Quality & Authority (Max 25 points)
  if (health.isHttps) points += 5;
  if (health.statusCode === 200) points += 10;
  if (health.internalLinksCount > 100) points += 10;
  else if (health.internalLinksCount > 20) points += 5;

  // 3. Organic Ranking & Visibility (Max 20 points)
  const rankNum = parseInt(rank, 10);
  if (!isNaN(rankNum) && rankNum > 0) {
    if (rankNum <= 3) points += 20;
    else if (rankNum <= 10) points += 15;
    else if (rankNum <= 20) points += 10;
    else points += 5;
  }

  // 4. Contact & Professionalism (Max 15 points)
  if (gbp && gbp.phoneNumber && gbp.phoneNumber !== 'Not Found') points += 5;
  if (gbp && gbp.address && gbp.address !== 'Not Found') points += 5;
  if (health.hasCanonical) points += 5;

  let stars = '★★★☆☆';
  let label = 'Good Lead';
  let explanation = '';

  if (points >= 80) {
    stars = '★★★★★';
    label = 'Priority Lead';
    explanation = "This business exhibits strong commercial signals with a substantial online presence, high customer review counts, and established search visibility. They represent a high-value client with an active marketing budget and a strong interest in maintaining market leadership.";
  } else if (points >= 60) {
    stars = '★★★★☆';
    label = 'Strong Lead';
    explanation = "An active and well-positioned business with established search visibility and solid customer reviews. They have a functional digital footprint and constitute a highly receptive candidate for digital growth and optimization services.";
  } else if (points >= 40) {
    stars = '★★★☆☆';
    label = 'Good Lead';
    explanation = "This business has a stable digital presence and moderate search visibility. While not a massive market leader, their consistent online footprint indicates they are an active commercial entity that would benefit from targeted local SEO and conversion optimization.";
  } else if (points >= 20) {
    stars = '★★☆☆☆';
    label = 'Low Priority';
    explanation = "This business has limited visibility, low review counts, and a thin online profile. While they could benefit from digital marketing, their small online footprint suggests a lower budget and a slower path to commercial engagement.";
  } else {
    stars = '★☆☆☆☆';
    label = 'Poor Fit';
    explanation = "This lead displays critical warning signs, including search indexation issues, missing profile details, or connection timeouts. Due to the lack of an active online presence or operational footprint, they are currently a poor fit for premium digital services.";
  }

  return {
    stars,
    label,
    explanation,
    points
  };
}

// POST Analyse endpoint
app.post('/api/analyse', async (req, res) => {
  const { url, searchType, rank, location } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let targetUrl = url;
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = targetUrl.replace(/^\/\//, '');
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    clearTimeout(id);

    let httpStatus = `${response.status} ${response.statusText || ''}`.trim();
    const contentType = response.headers.get('content-type') || '';
    
    const xRobots = response.headers.get('x-robots-tag') || '';
    const hasNoIndexHeader = /noindex/i.test(xRobots);

    let html = '';
    try {
      html = await response.text();
    } catch (e) {
      console.warn('Failed to parse text from response:', e);
    }

    let $ = cheerio.load(html);

    // Extraction & Computations
    const isHttps = targetUrl.startsWith('https://');
    let statusCode = response.status;
    const indexableVal = robots => {
      if (/noindex/i.test(robots) || hasNoIndexHeader) return false;
      return true;
    };

    let title = $('title').first().text().trim();

    if (isPlaceholderTitle(title)) {
      console.log(`[Placeholder Detected] Detected interstitial page: "${title}". Retrying extraction with Puppeteer...`);
      const puppeteerResult = await fetchPageWithPuppeteer(targetUrl);
      if (puppeteerResult.success) {
        const $puppeteer = cheerio.load(puppeteerResult.html);
        const newTitle = $puppeteer('title').first().text().trim();
        
        if (!isPlaceholderTitle(newTitle)) {
          console.log(`[Placeholder Resolved] Puppeteer successfully retrieved actual title: "${newTitle}"`);
          title = newTitle;
          html = puppeteerResult.html;
          targetUrl = puppeteerResult.finalUrl;
          statusCode = puppeteerResult.status;
          httpStatus = `${puppeteerResult.status} OK`;
          $ = $puppeteer;
        } else {
          console.warn(`[Placeholder Detected] Puppeteer title is still placeholder: "${newTitle}"`);
          throw new Error('Page could not be analysed correctly (interstitial detected)');
        }
      } else {
        console.warn(`[Placeholder Detected] Puppeteer fetch failed: ${puppeteerResult.error}`);
        throw new Error(`Page could not be analysed correctly (puppeteer fetch failed: ${puppeteerResult.error})`);
      }
    }
    
    let description = '';
    $('meta').each((i, el) => {
      const name = $(el).attr('name');
      const property = $(el).attr('property');
      if (name && name.toLowerCase() === 'description') {
        description = $(el).attr('content')?.trim() || '';
      } else if (property && property.toLowerCase() === 'og:description') {
        if (!description) {
          description = $(el).attr('content')?.trim() || '';
        }
      }
    });

    const h1Count = $('h1').length;
    const h1Text = $('h1').first().text().trim() || '';
    const h2Count = $('h2').length;
    const canonical = $('link[rel="canonical"]').attr('href')?.trim() || '';

    // Word Count
    const $clone = cheerio.load(html);
    $clone('script, style, noscript, iframe, svg, head').remove();
    const visibleText = $clone('body').text() || '';
    const words = visibleText.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Images
    const images = $('img');
    const imageCount = images.length;
    let missingAltCount = 0;
    images.each((i, img) => {
      const alt = $(img).attr('alt');
      if (alt === undefined || alt === null || alt.trim() === '') {
        missingAltCount++;
      }
    });

    // Links (Internal & External)
    const links = $('a[href]');
    let internalLinksCount = 0;
    let externalLinksCount = 0;

    let baseDomain = '';
    try {
      baseDomain = new URL(targetUrl).hostname.replace(/^www\./, '');
    } catch (e) {
      baseDomain = targetUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }

    links.each((i, link) => {
      const href = $(link).attr('href')?.trim();
      if (!href) return;
      if (href.startsWith('#') || href.startsWith('javascript:')) return;
      
      if (href.startsWith('/') || !/^(https?:)?\/\//i.test(href)) {
        internalLinksCount++;
      } else {
        try {
          const linkDomain = new URL(href).hostname.replace(/^www\./, '');
          if (linkDomain === baseDomain) {
            internalLinksCount++;
          } else {
            externalLinksCount++;
          }
        } catch (e) {
          if (/^https?:\/\//i.test(href)) {
            externalLinksCount++;
          } else {
            internalLinksCount++;
          }
        }
      }
    });

    let robotsVal = '';
    $('meta').each((i, el) => {
      const name = $(el).attr('name');
      if (name && (name.toLowerCase() === 'robots' || name.toLowerCase() === 'googlebot')) {
        robotsVal = $(el).attr('content') || '';
      }
    });
    const indexableBool = indexableVal(robotsVal);

    const seoHealthData = {
      isHttps,
      statusCode,
      indexable: indexableBool,
      hasCanonical: canonical.length > 0,
      titlePresent: title.length > 0,
      titleLength: title.length,
      descriptionPresent: description.length > 0,
      descriptionLength: description.length,
      h1Present: h1Count > 0,
      h1Count,
      h2Count,
      wordCount,
      imageCount,
      missingAltCount,
      internalLinksCount,
      externalLinksCount
    };

    const aiReport = generateAIReport(seoHealthData);
    const leadOpportunity = generateLeadDashboard(seoHealthData, searchType || 'Organic', rank || 0, targetUrl);

    const gbp = await performGbpMatching(targetUrl, html, title, h1Text, location);
    const leadScore = getOpportunityScoreAndReasons(seoHealthData, gbp, rank);
    const leadPriority = getPriorityRating(seoHealthData, gbp, rank);

    return res.json({
      pageTitle: title || 'Not Found',
      metaDescription: description || 'Not Found',
      h1: h1Text || 'Not Found',
      httpStatus: httpStatus,
      canonicalUrl: canonical || 'Not Found',
      indexable: indexableBool ? 'Yes' : 'No',
      lastAnalysed: new Date().toISOString(),
      seoHealth: seoHealthData,
      aiReport: aiReport,
      leadOpportunity: leadOpportunity,
      gbp: gbp,
      leadOpportunityScore: leadScore,
      leadPriority: leadPriority
    });

  } catch (error) {
    console.error('Fetch error:', error);
    let statusText = 'Connection Error';
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      statusText = 'Timeout';
    }
    const fallbackHealth = {
      isHttps: targetUrl.startsWith('https://'),
      statusCode: 0,
      indexable: false,
      hasCanonical: false,
      titlePresent: false,
      titleLength: 0,
      descriptionPresent: false,
      descriptionLength: 0,
      h1Present: false,
      h1Count: 0,
      h2Count: 0,
      wordCount: 0,
      imageCount: 0,
      missingAltCount: 0,
      internalLinksCount: 0,
      externalLinksCount: 0
    };
    const gbp = await performGbpMatching(targetUrl, '', '', '', location);
    const leadScore = getOpportunityScoreAndReasons(fallbackHealth, gbp, rank);
    const leadPriority = getPriorityRating(fallbackHealth, gbp, rank);
    const fallbackOpportunity = generateLeadDashboard(fallbackHealth, searchType || 'Organic', rank || 0, targetUrl);

    return res.json({
      pageTitle: 'Not Found',
      metaDescription: 'Not Found',
      h1: 'Not Found',
      httpStatus: statusText,
      canonicalUrl: 'Not Found',
      indexable: 'No',
      lastAnalysed: new Date().toISOString(),
      error: `Could not fetch website: ${error.message}`,
      seoHealth: fallbackHealth,
      aiReport: generateAIReport(fallbackHealth),
      leadOpportunity: fallbackOpportunity,
      gbp: gbp,
      leadOpportunityScore: leadScore,
      leadPriority: leadPriority
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

function generateAIReport(health) {
  if (!health) return null;

  const fails = [];
  const warnings = [];
  const passes = [];

  // Technical
  if (!health.isHttps) {
    fails.push({
      issue: 'Website lacks HTTPS encryption',
      impact: 'Critical',
      whyItMatters: 'Search engines flag non-secure sites and lower their ranking. Users see "Not Secure" warnings, killing conversion rates.',
      recommendation: 'Install a valid SSL certificate and configure 301 redirects to force HTTPS protocol.'
    });
  } else {
    passes.push('HTTPS security is active.');
  }

  if (health.statusCode !== 200 && health.statusCode !== 0) {
    fails.push({
      issue: `Non-200 HTTP response code (${health.statusCode})`,
      impact: 'Critical',
      whyItMatters: 'Search crawlers and users cannot access the page contents if the server returns error codes.',
      recommendation: 'Investigate web server logs to fix connection errors or server-side script failures.'
    });
  }

  if (!health.indexable) {
    fails.push({
      issue: 'Page is blocked from indexation (noindex)',
      impact: 'Critical',
      whyItMatters: 'Search engines are instructed to ignore this page completely, preventing it from appearing in any organic search results.',
      recommendation: 'Remove noindex directives from meta robots tags and X-Robots-Tag headers.'
    });
  }

  if (!health.hasCanonical) {
    fails.push({
      issue: 'Missing canonical URL link tag',
      impact: 'High',
      whyItMatters: 'Without a canonical declaration, search engines can index duplicate versions of the page, diluting rankings.',
      recommendation: 'Add a self-referencing <link rel="canonical" href="..."> element to the HTML head.'
    });
  } else {
    passes.push('Canonical URL is configured.');
  }

  // On-Page
  if (!health.titlePresent) {
    fails.push({
      issue: 'Page title is missing',
      impact: 'Critical',
      whyItMatters: 'The page title is the primary clickable headline in SERPs and a vital organic ranking signal.',
      recommendation: 'Add a descriptive <title> tag matching search intent.'
    });
  } else if (health.titleLength < 50 || health.titleLength > 60) {
    warnings.push({
      issue: `Sub-optimal title tag length (${health.titleLength} characters)`,
      impact: 'Medium',
      whyItMatters: 'Titles under 50 chars waste SEO real estate, while titles over 60 chars get truncated in Google search results.',
      recommendation: 'Rewrite the title tag to be exactly between 50 and 60 characters, including main keyword and brand.'
    });
  } else {
    passes.push('Title length is optimal.');
  }

  if (!health.descriptionPresent) {
    fails.push({
      issue: 'Meta description is missing',
      impact: 'High',
      whyItMatters: 'Meta descriptions act as organic ad copy in SERPs. Missing descriptions cause Google to generate random snippets, lowering CTR.',
      recommendation: 'Write a unique, compelling meta description containing your target keywords.'
    });
  } else if (health.descriptionLength < 120 || health.descriptionLength > 160) {
    warnings.push({
      issue: `Sub-optimal meta description length (${health.descriptionLength} characters)`,
      impact: 'Medium',
      whyItMatters: 'Descriptions under 120 chars fail to convey value, while descriptions over 160 chars get cut off by search engines.',
      recommendation: 'Refine the description to be between 120 and 160 characters with a clear call-to-action.'
    });
  } else {
    passes.push('Meta description length is optimal.');
  }

  if (health.h1Count === 0) {
    fails.push({
      issue: 'Missing H1 heading tag',
      impact: 'High',
      whyItMatters: 'H1 tells search engines what the page is about. Missing H1 headings confuse search engines about page structure.',
      recommendation: 'Create a single H1 tag at the top of the content containing the page\'s primary keyword.'
    });
  } else if (health.h1Count > 1) {
    warnings.push({
      issue: `Multiple H1 heading tags found (${health.h1Count})`,
      impact: 'Medium',
      whyItMatters: 'Having more than one H1 heading tag dilutes the semantic focus of the page and confuses crawlers.',
      recommendation: 'Consolidate headings so there is exactly one H1 tag. Demote other headings to H2 or H3.'
    });
  } else {
    passes.push('Exactly one H1 tag is present.');
  }

  if (health.h2Count === 0) {
    warnings.push({
      issue: 'No H2 sub-headings found',
      impact: 'Low',
      whyItMatters: 'H2 headings structure sub-topics, helping crawlers parse content depth and index rich snippets.',
      recommendation: 'Break up body copy with H2 sub-headings matching secondary search queries.'
    });
  } else {
    passes.push('H2 sub-headings are present.');
  }

  if (health.wordCount < 300) {
    fails.push({
      issue: `Thin content detected (${health.wordCount} words)`,
      impact: 'High',
      whyItMatters: 'Thin content offers low value to searchers. Google penalizes pages under 300 words for quality reasons.',
      recommendation: 'Expand content with informative, original text answering user questions in detail.'
    });
  } else if (health.wordCount < 600) {
    warnings.push({
      issue: `Short content length (${health.wordCount} words)`,
      impact: 'Medium',
      whyItMatters: 'Content under 600 words struggles to cover search queries comprehensively, limiting organic reach.',
      recommendation: 'Add structured sub-topics, case studies, or FAQs to push the word count above 600.'
    });
  } else {
    passes.push('Word count is healthy.');
  }

  // Content
  if (health.imageCount > 0 && health.missingAltCount > 0) {
    warnings.push({
      issue: `${health.missingAltCount} images lack ALT attributes`,
      impact: 'Medium',
      whyItMatters: 'ALT tags describe images for accessibility and image search indexation. Missing ALT tags lose image traffic.',
      recommendation: 'Add descriptive, keyword-relevant ALT attributes to all missing images.'
    });
  }

  if (health.internalLinksCount === 0) {
    warnings.push({
      issue: 'Zero internal links found',
      impact: 'Medium',
      whyItMatters: 'Internal links distribute page authority and guide user navigation across the site.',
      recommendation: 'Add relevant contextual internal links pointing to high-priority services or landing pages.'
    });
  }

  if (health.externalLinksCount === 0) {
    warnings.push({
      issue: 'Zero external links found',
      impact: 'Low',
      whyItMatters: 'Linking to reputable external sources signals authority, trust, and fact-check verification to search engines.',
      recommendation: 'Add outbound links to authoritative resources or reference sites.'
    });
  }

  // 1. Executive Summary Generation (2-3 sentences)
  let execSummary = '';
  if (fails.length === 0 && warnings.length === 0) {
    execSummary = 'The website demonstrates stellar search engine optimization. Technical structures are healthy, indexability is unobstructed, and on-page content meets or exceeds standards. No critical interventions are necessary, and current efforts should focus on content freshness and backlink acquisition.';
  } else if (fails.length === 0) {
    execSummary = 'The website is technically functional and indexed, but features several minor optimization bottlenecks. Reviewing meta lengths, sub-headings structure, and alt attributes will improve semantic clarity. Implementing these on-page improvements will help solidify current ranking positions and capture auxiliary query traffic.';
  } else {
    const criticalCount = fails.length;
    execSummary = `The audit revealed ${criticalCount} critical SEO issues that restrict this website's organic visibility and user conversion rates. Bottlenecks in technical indexability, security, or foundational elements like title tags must be resolved immediately. Addressing these primary issues will unlock the site's capability to rank for relevant target search keywords.`;
  }

  // 2. Top 5 Priority Opportunities
  const combinedIssues = [...fails, ...warnings];
  const priorityOpportunities = combinedIssues.slice(0, 5).map((item, idx) => ({
    id: idx + 1,
    issue: item.issue,
    impact: item.impact,
    whyItMatters: item.whyItMatters,
    recommendedAction: item.recommendation
  }));

  // 3. Quick Wins
  const quickWins = [];
  const hasIssue = (titlePart) => combinedIssues.some(x => x.issue.toLowerCase().includes(titlePart.toLowerCase()));
  
  if (hasIssue('https')) {
    quickWins.push('Install Let\'s Encrypt Free SSL certificate to establish HTTPS.');
  }
  if (hasIssue('title') || hasIssue('titleLength')) {
    quickWins.push('Tune the homepage title tag to be exactly 50–60 characters.');
  }
  if (hasIssue('description') || hasIssue('descriptionLength')) {
    quickWins.push('Extend or trim the meta description to fall between 120 and 160 characters.');
  }
  if (hasIssue('canonical')) {
    quickWins.push('Inject a self-referencing canonical URL link tag.');
  }
  if (hasIssue('alt')) {
    quickWins.push(`Add alt descriptions to the ${health.missingAltCount} images currently lacking them.`);
  }
  if (hasIssue('h1')) {
    quickWins.push('Ensure exactly one main H1 tag exists at the top of the homepage.');
  }
  
  if (quickWins.length === 0) {
    quickWins.push('Perform a backlink audit to discover high-value link-building opportunities.');
    quickWins.push('Optimize image files sizes to improve page loading speed.');
  }

  return {
    execSummary,
    priorityOpportunities,
    quickWins: quickWins.slice(0, 3)
  };
}

function generateLeadDashboard(health, searchType, rank, targetUrl) {
  if (!health) return null;

  const isOrganic = searchType === 'Organic';
  const hasGbp = !isOrganic;
  const gbpStatus = hasGbp ? 'Yes' : 'Unknown';
  
  let pageType = 'Homepage';
  try {
    const path = new URL(targetUrl).pathname;
    if (path !== '/' && path !== '') {
      pageType = 'Internal Page';
    }
  } catch (e) {
    pageType = 'Homepage';
  }

  // Handle server connection failure / timeout
  if (health.statusCode === 0) {
    return {
      rank: rank || 'Not available',
      gbpDetected: gbpStatus,
      titlePresent: 'Unknown',
      descriptionPresent: 'Unknown',
      h1Present: 'Unknown',
      pageType: pageType,
      overallOpportunity: 'High',
      reasonToContact: `We were unable to establish a connection to your website. This could indicate a server outage or critical hosting error, which prevents search engine crawlers and prospective clients from accessing your services.`,
      suggestedEmailAngle: `While attempting to review your website, I noticed that the page was inaccessible and returned a connection error. I wanted to check in to see if you are experiencing server downtime or hosting issues.`
    };
  }

  const missing = [];
  if (!health.titlePresent) missing.push('page title');
  if (!health.descriptionPresent) missing.push('meta description');
  if (!health.h1Present) missing.push('H1 heading');

  const weak = [];
  if (health.titlePresent && (health.titleLength < 40 || health.titleLength > 70)) {
    weak.push('meta title length');
  }
  if (health.descriptionPresent && (health.descriptionLength < 100 || health.descriptionLength > 160)) {
    weak.push('meta description length');
  }

  // Calculate opportunity level
  let overallOpportunity = 'Low';
  if (missing.length > 0) {
    overallOpportunity = 'High';
  } else if (weak.length > 0) {
    overallOpportunity = 'Medium';
  }

  const formatList = (arr) => {
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
    return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`;
  };

  let reasonToContact = '';
  let emailAngle = '';

  if (missing.length > 0) {
    reasonToContact = `We found several basic SEO elements missing from the page currently appearing in Google, including the ${formatList(missing)}. These are straightforward improvements that could help improve visibility and increase enquiries.`;
    emailAngle = `While reviewing your website, I noticed a few basic SEO elements are missing from the page currently ranking in Google. They're relatively quick fixes that could help improve both visibility and click-through rates.`;
  } else if (weak.length > 0) {
    reasonToContact = `We found that while foundational SEO elements are present on your page, the ${formatList(weak)} is currently sub-optimal under search guidelines. Refining these tags is a straightforward improvement to maximize search page real estate and capture more traffic.`;
    emailAngle = `While reviewing your website, I noticed that although your page ranks in Google, some key metadata tags are not fully optimized for size and display. Tweaking these lengths is a quick way to improve search results visibility and attract more clicks.`;
  } else {
    reasonToContact = `The website's foundational on-page optimization is fully optimized with all key elements in place. The primary opportunity is to expand search coverage using deeper service landing pages, local schema, or content campaigns to capture auxiliary search traffic.`;
    emailAngle = `While reviewing your website, I noticed your page has strong metadata and heading optimization in place. I wanted to reach out to suggest a quick win for scaling your traffic—creating targeted landing pages to capture other high-intent buyer searches in your area.`;
  }

  return {
    rank: rank || 'Not available',
    gbpDetected: gbpStatus,
    titlePresent: health.titlePresent ? 'Present' : 'Missing',
    descriptionPresent: health.descriptionPresent ? 'Present' : 'Missing',
    h1Present: health.h1Present ? 'Present' : 'Missing',
    pageType: pageType,
    overallOpportunity,
    reasonToContact,
    suggestedEmailAngle: emailAngle
  };
}
