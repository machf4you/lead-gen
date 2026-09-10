import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';
import nodemailer from 'nodemailer';
import { getDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// API version endpoint
app.get('/api/version', async (req, res) => {
  try {
    const candidatePaths = [
      path.join(__dirname, '..', 'version.json'),
      path.join(process.cwd(), 'version.json'),
      path.join(__dirname, 'version.json')
    ];
    for (const p of candidatePaths) {
      try {
        const data = await fs.readFile(p, 'utf8');
        return res.json(JSON.parse(data));
      } catch (e) {}
    }
  } catch (err) {}
  res.json({ id: 'tse_lead_gen', commit_hash: 'unknown', build_time: null });
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
            depth: 50
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
      const pageOrganic = items.filter(item => item.type === 'organic');
      const organicResults = [];
      const seenUrls = new Set();

      const db = await getDb();
      const excRows = await db.all('SELECT domain FROM excluded_domains');
      const excludedList = excRows.map(r => r.domain);

      for (const item of pageOrganic) {
        if (organicResults.length >= 50) break;

        const url = item.url || "";
        const itemDomain = item.domain || getDomain(url);
        if (url && !seenUrls.has(url) && !isDomainExcluded(itemDomain || url, excludedList)) {
          seenUrls.add(url);
          organicResults.push({
            rank: organicResults.length + 1,
            title: item.title || "",
            domain: itemDomain,
            url: url,
            description: item.description || ""
          });
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

      const db = await getDb();
      const excRows = await db.all('SELECT domain FROM excluded_domains');
      const excludedList = excRows.map(r => r.domain);

      const items = task?.result?.[0]?.items || [];
      const businesses = items
        .filter(item => !isDomainExcluded(item.url || item.title, excludedList))
        .map((item, index) => ({
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

function normalizeDomain(urlOrDomain) {
  if (!urlOrDomain) return '';
  let str = String(urlOrDomain).trim().toLowerCase();
  if (str.includes('://')) {
    try {
      str = new URL(str).hostname;
    } catch (e) {
      str = str.replace(/^https?:\/\//i, '').split('/')[0];
    }
  } else {
    str = str.split('/')[0].split('?')[0];
  }
  return str.replace(/^www\./i, '').trim();
}

function isDomainExcluded(urlOrDomain, excludedList) {
  if (!urlOrDomain || !excludedList || !Array.isArray(excludedList) || excludedList.length === 0) return false;
  const target = normalizeDomain(urlOrDomain);
  if (!target) return false;

  return excludedList.some(exc => {
    const excNorm = normalizeDomain(exc);
    if (!excNorm) return false;
    if (target === excNorm) return true;
    if (target.endsWith('.' + excNorm)) return true;
    if (excNorm.endsWith('.' + target)) return true;
    return false;
  });
}

function getDomain(urlStr) {
  return normalizeDomain(urlStr);
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

  let html = '';
  let httpStatus = '';
  let statusCode = 200;
  let fetchError = null;

  // Step 1: Try standard HTTP fetch first
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9'
      }
    });

    clearTimeout(id);
    statusCode = response.status;
    httpStatus = `${response.status} ${response.statusText || ''}`.trim();

    if (response.status < 400) {
      try {
        html = await response.text();
      } catch (e) {}
    } else {
      fetchError = new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
    }
  } catch (err) {
    fetchError = err;
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      httpStatus = 'Timeout';
    } else {
      httpStatus = 'Connection Error';
    }
  }

  let $ = html ? cheerio.load(html) : null;
  let title = $ ? $('title').first().text().trim() : '';

  // Step 2: Fallback to Puppeteer if fetch failed (>=400 / error / empty) or returned an interstitial/placeholder
  const needsPuppeteer = !html || statusCode >= 400 || isPlaceholderTitle(title);
  if (needsPuppeteer) {
    console.log(`[Analysis Fallback] Fetch got status ${statusCode} (title: "${title || 'none'}"). Attempting Puppeteer browser fallback for: ${targetUrl}`);
    const puppeteerResult = await fetchPageWithPuppeteer(targetUrl);
    if (puppeteerResult.success && puppeteerResult.html) {
      const $puppeteer = cheerio.load(puppeteerResult.html);
      const newTitle = $puppeteer('title').first().text().trim();
      
      if (!isPlaceholderTitle(newTitle) || puppeteerResult.status < 400) {
        console.log(`[Analysis Fallback Resolved] Puppeteer retrieved page with status ${puppeteerResult.status} (Title: "${newTitle}")`);
        html = puppeteerResult.html;
        targetUrl = puppeteerResult.finalUrl || targetUrl;
        statusCode = puppeteerResult.status;
        httpStatus = `${puppeteerResult.status} OK`;
        $ = $puppeteer;
        title = newTitle;
        fetchError = null;
      } else {
        console.warn(`[Analysis Fallback] Puppeteer page still returned placeholder/error: "${newTitle}"`);
      }
    }
  }

  // Step 3: If still no usable HTML or hard HTTP error after all fallbacks
  if (!html || statusCode >= 400 || !$ || isPlaceholderTitle(title)) {
    let statusText = httpStatus || 'Connection Error';
    if (fetchError?.message?.startsWith('HTTP ')) {
      statusText = fetchError.message.replace(/^HTTP\s+/, '');
    }
    const isHttps = targetUrl.startsWith('https://');
    const fallbackHealth = {
      isHttps,
      statusCode: statusCode >= 400 ? statusCode : (statusText.startsWith('4') || statusText.startsWith('5') ? parseInt(statusText.split(' ')[0], 10) || 0 : 0),
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

    return res.json({
      pageTitle: 'Not Found',
      metaDescription: 'Not Found',
      h1: 'Not Found',
      httpStatus: statusText,
      canonicalUrl: 'Not Found',
      indexable: 'No',
      lastAnalysed: new Date().toISOString(),
      error: `Could not fetch website: ${fetchError?.message || statusText}`,
      seoHealth: fallbackHealth,
      aiReport: {
        execSummary: `Website analysis failed (${statusText}). Technical metrics could not be gathered.`,
        opportunities: [`Unable to inspect ${targetUrl} due to connection failure or security restrictions.`]
      },
      leadOpportunity: {
        rank: rank || 'Not available',
        gbpDetected: gbp?.status === 'Found' ? 'Yes' : (gbp?.status === 'Multiple Matches' ? 'Multiple' : 'No'),
        titlePresent: 'N/A',
        descriptionPresent: 'N/A',
        h1Present: 'N/A',
        pageType: 'Homepage',
        overallOpportunity: 'N/A',
        reasonToContact: `Unable to access website: ${statusText}.`,
        suggestedEmailAngle: 'Reach out to check if their website server is experiencing downtime.'
      },
      gbp: gbp,
      leadOpportunityScore: {
        score: null,
        band: 'N/A',
        reasons: [
          `Website analysis failed (${statusText})`,
          "Technical SEO signals could not be gathered due to connection or accessibility failure",
          "No artificial score is assigned to inaccessible websites"
        ]
      },
      leadPriority: {
        stars: '☆☆☆☆☆',
        label: 'Analysis Failed',
        explanation: `Unable to inspect website due to ${statusText}. Analysis can be retried.`,
        points: 0
      }
    });
  }

  // Step 4: Normal extraction when HTML was successfully obtained
  const isHttps = targetUrl.startsWith('https://');
  const indexableBool = !/noindex/i.test($('meta[name="robots"]').attr('content') || '') && !/noindex/i.test($('meta[name="googlebot"]').attr('content') || '');

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

  // Links
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

  const seoHealthData = {
    isHttps,
    statusCode: statusCode || 200,
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
    httpStatus: httpStatus || '200 OK',
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

// GET saved searches
app.get('/api/saved-searches', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM saved_searches ORDER BY id DESC');
    const excRows = await db.all('SELECT domain FROM excluded_domains');
    const excludedList = excRows.map(r => r.domain);

    const searches = rows.map(row => {
      const parsedData = JSON.parse(row.data);
      const filteredData = parsedData.filter(item => !isDomainExcluded(item.domain || item.url || item.website, excludedList));
      return {
        ...row,
        count: filteredData.length,
        data: filteredData
      };
    });
    res.json(searches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single saved search by searchId or id
app.get('/api/saved-searches/:searchId', async (req, res) => {
  try {
    const { searchId } = req.params;
    const db = await getDb();
    const row = await db.get('SELECT * FROM saved_searches WHERE searchId = ? OR id = ?', [searchId, searchId]);
    if (!row) {
      return res.status(404).json({ error: 'Search not found' });
    }
    const excRows = await db.all('SELECT domain FROM excluded_domains');
    const excludedList = excRows.map(r => r.domain);
    const parsedData = JSON.parse(row.data);
    const filteredData = parsedData.filter(item => !isDomainExcluded(item.domain || item.url || item.website, excludedList));

    res.json({
      ...row,
      count: filteredData.length,
      data: filteredData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST atomic item analysis update to a saved search
app.post('/api/saved-searches/:searchId/item-analysis', async (req, res) => {
  try {
    const { searchId } = req.params;
    const { url, website, name, rank, analysis } = req.body;
    if (!analysis) {
      return res.status(400).json({ error: 'Analysis data is required' });
    }
    const db = await getDb();
    const row = await db.get('SELECT * FROM saved_searches WHERE searchId = ? OR id = ?', [searchId, searchId]);
    if (!row) {
      return res.status(404).json({ error: 'Search not found' });
    }
    const data = JSON.parse(row.data);
    let updated = false;
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const isMatch = (url && item.url === url) ||
                      (rank !== undefined && rank !== null && item.rank === rank) ||
                      (website && item.website === website) ||
                      (name && item.name === name);
      if (isMatch) {
        data[i].analysis = analysis;
        updated = true;
        break;
      }
    }
    if (updated) {
      await db.run('UPDATE saved_searches SET data = ? WHERE id = ?', [JSON.stringify(data), row.id]);
    }
    res.json({ success: true, updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST save/update search
app.post('/api/saved-searches', async (req, res) => {
  try {
    const { id, searchId, searchType, businessType, location, searchMode, dateTime, count, data } = req.body;
    if (!id || !searchId || !searchType || !dateTime || !data) {
      return res.status(400).json({ error: 'Missing required search fields' });
    }
    const db = await getDb();
    const existing = await db.get("SELECT id FROM saved_searches WHERE searchId = ?", [searchId]);
    if (existing) {
      await db.run(
        `UPDATE saved_searches 
         SET searchType = ?, businessType = ?, location = ?, searchMode = ?, dateTime = ?, count = ?, data = ?
         WHERE searchId = ?`,
        [searchType, businessType, location, searchMode, dateTime, count, typeof data === 'string' ? data : JSON.stringify(data), searchId]
      );
    } else {
      await db.run(
        `INSERT INTO saved_searches (id, searchId, searchType, businessType, location, searchMode, dateTime, count, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, searchId, searchType, businessType, location, searchMode, dateTime, count, typeof data === 'string' ? data : JSON.stringify(data)]
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE saved search
app.delete('/api/saved-searches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM saved_searches WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET excluded domains
app.get('/api/exclusions', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT domain FROM excluded_domains ORDER BY createdAt DESC');
    res.json(rows.map(r => r.domain));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST excluded domain(s) - supports single domain or array of domains for migration
app.post('/api/exclusions', async (req, res) => {
  try {
    const db = await getDb();
    const createdAt = new Date().toISOString();
    const rawDomains = req.body.domains || (req.body.domain ? [req.body.domain] : []);
    
    if (!Array.isArray(rawDomains) || rawDomains.length === 0) {
      return res.status(400).json({ error: 'No domain provided' });
    }

    for (const raw of rawDomains) {
      const dom = normalizeDomain(raw);
      if (dom) {
        await db.run(
          `INSERT OR IGNORE INTO excluded_domains (domain, createdAt) VALUES (?, ?)`,
          [dom, createdAt]
        );
      }
    }

    const rows = await db.all('SELECT domain FROM excluded_domains ORDER BY createdAt DESC');
    res.json(rows.map(r => r.domain));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE excluded domain
app.delete('/api/exclusions/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const dom = normalizeDomain(decodeURIComponent(domain));
    const db = await getDb();
    if (dom) {
      await db.run('DELETE FROM excluded_domains WHERE domain = ?', [dom]);
    }
    const rows = await db.all('SELECT domain FROM excluded_domains ORDER BY createdAt DESC');
    res.json(rows.map(r => r.domain));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET outreach shortlist
app.get('/api/outreach', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM outreach_shortlist ORDER BY shortlistedAt DESC');
    const items = rows.map(r => {
      let parsedAnalysis = null;
      if (r.analysisData) {
        try {
          parsedAnalysis = JSON.parse(r.analysisData);
        } catch (e) {}
      }
      return {
        ...r,
        analysisData: parsedAnalysis
      };
    });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST add prospect to outreach shortlist (with duplicate prevention)
app.post('/api/outreach', async (req, res) => {
  try {
    const {
      id,
      domain: rawDomain,
      url,
      businessName,
      searchId,
      searchPhrase,
      location,
      searchType,
      rank,
      opportunityScore,
      opportunityBand,
      commercialStrengthStars,
      commercialStrengthLabel,
      commercialStrengthPoints,
      gbpStatus,
      analysisData
    } = req.body;

    const domain = normalizeDomain(rawDomain || url || '');
    if (!domain) {
      return res.status(400).json({ error: 'Domain or URL is required' });
    }

    const db = await getDb();

    // Check if duplicate already exists
    const existing = await db.get('SELECT * FROM outreach_shortlist WHERE domain = ?', [domain]);
    if (existing) {
      let parsedAnalysis = null;
      if (existing.analysisData) {
        try {
          parsedAnalysis = JSON.parse(existing.analysisData);
        } catch (e) {}
      }
      return res.json({
        success: true,
        alreadyShortlisted: true,
        item: {
          ...existing,
          analysisData: parsedAnalysis
        }
      });
    }

    const itemId = id || `shortlist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const shortlistedAt = new Date().toISOString();
    const serializedAnalysis = typeof analysisData === 'object' && analysisData !== null
      ? JSON.stringify(analysisData)
      : (typeof analysisData === 'string' ? analysisData : null);

    await db.run(
      `INSERT INTO outreach_shortlist (
        id, domain, url, businessName, searchId, searchPhrase, location, searchType,
        rank, opportunityScore, opportunityBand, commercialStrengthStars, commercialStrengthLabel,
        commercialStrengthPoints, gbpStatus, analysisData, shortlistedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        itemId,
        domain,
        url || '',
        businessName || '',
        searchId || '',
        searchPhrase || '',
        location || '',
        searchType || 'Organic',
        rank !== undefined && rank !== null ? parseInt(rank, 10) : null,
        opportunityScore !== undefined && opportunityScore !== null ? parseInt(opportunityScore, 10) : null,
        opportunityBand || '',
        commercialStrengthStars || '',
        commercialStrengthLabel || '',
        commercialStrengthPoints !== undefined && commercialStrengthPoints !== null ? parseInt(commercialStrengthPoints, 10) : null,
        gbpStatus || 'No Profile Matched',
        serializedAnalysis,
        shortlistedAt
      ]
    );

    const inserted = await db.get('SELECT * FROM outreach_shortlist WHERE id = ?', [itemId]);
    let parsedInsertedAnalysis = null;
    if (inserted && inserted.analysisData) {
      try {
        parsedInsertedAnalysis = JSON.parse(inserted.analysisData);
      } catch (e) {}
    }

    res.json({
      success: true,
      alreadyShortlisted: false,
      item: {
        ...inserted,
        analysisData: parsedInsertedAnalysis
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to decode Cloudflare-obfuscated emails (data-cfemail / email-protection)
function decodeCfEmail(encodedString) {
  if (!encodedString || typeof encodedString !== 'string') return '';
  let email = '';
  try {
    const r = parseInt(encodedString.substring(0, 2), 16);
    for (let n = 2; encodedString.length - n; n += 2) {
      const i = parseInt(encodedString.substring(n, 2), 16) ^ r;
      email += String.fromCharCode(i);
    }
  } catch (e) {
    return '';
  }
  return email;
}

// Helper to extract and validate emails from HTML
function extractEmailsFromHtml(html, baseDomain) {
  if (!html || typeof html !== 'string') return [];
  const found = new Set();
  
  // 1. Cloudflare protected emails: data-cfemail
  const cfRegex = /data-cfemail=["']([a-fA-F0-9]+)["']/gi;
  let cfMatch;
  while ((cfMatch = cfRegex.exec(html)) !== null) {
    const decoded = decodeCfEmail(cfMatch[1]);
    if (isValidEmail(decoded, baseDomain)) {
      found.add(decoded.toLowerCase().trim());
    }
  }

  // Cloudflare email-protection URLs: /cdn-cgi/l/email-protection#[hash]
  const cfUrlRegex = /\/cdn-cgi\/l\/email-protection#([a-fA-F0-9]+)/gi;
  let cfUrlMatch;
  while ((cfUrlMatch = cfUrlRegex.exec(html)) !== null) {
    const decoded = decodeCfEmail(cfUrlMatch[1]);
    if (isValidEmail(decoded, baseDomain)) {
      found.add(decoded.toLowerCase().trim());
    }
  }

  // 2. Mailto links
  const mailtoRegex = /href=["']mailto:([^"'>\s?]+)(?:\?[^"']*)?["']/gi;
  let match;
  while ((match = mailtoRegex.exec(html)) !== null) {
    try {
      const raw = decodeURIComponent(match[1]).toLowerCase().trim();
      if (isValidEmail(raw, baseDomain)) {
        found.add(raw);
      }
    } catch (e) {}
  }

  // 3. JSON-LD scripts
  const jsonLdRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch;
  while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const checkObj = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (typeof obj.email === 'string') {
          const em = obj.email.replace(/^mailto:/i, '').toLowerCase().trim();
          if (isValidEmail(em, baseDomain)) found.add(em);
        }
        for (const k of Object.keys(obj)) {
          if (typeof obj[k] === 'object') checkObj(obj[k]);
        }
      };
      if (Array.isArray(parsed)) parsed.forEach(checkObj);
      else checkObj(parsed);
    } catch (e) {}
  }

  // 4. Standard regex across body
  const bodyEmailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  let textMatch;
  while ((textMatch = bodyEmailRegex.exec(html)) !== null) {
    const email = textMatch[0].toLowerCase().trim();
    if (isValidEmail(email, baseDomain)) {
      found.add(email);
    }
  }

  // 5. Cleaned HTML (strip <br>, <wbr>, inline formatting tags that break up email text e.g. "hello@<br>domain.co.uk")
  const cleanedHtml = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<wbr\s*\/?>/gi, '')
    .replace(/<\/?(span|strong|em|b|i|font|p|div|h1|h2|h3|h4|h5|h6)[^>]*>/gi, ' ');

  let cleanedMatch;
  const cleanedRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  while ((cleanedMatch = cleanedRegex.exec(cleanedHtml)) !== null) {
    const email = cleanedMatch[0].toLowerCase().trim();
    if (isValidEmail(email, baseDomain)) {
      found.add(email);
    }
  }

  // 6. Text with whitespace/newlines around @ symbol
  const strippedText = cleanedHtml.replace(/<[^>]+>/g, ' ');
  const spacedMatches = [...strippedText.matchAll(/([a-zA-Z0-9._%+-]+)\s*[@]\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)];
  for (const m of spacedMatches) {
    const combined = `${m[1]}@${m[2]}`.toLowerCase().trim();
    if (isValidEmail(combined, baseDomain)) {
      found.add(combined);
    }
  }

  return Array.from(found);
}

function isValidEmail(email, baseDomain) {
  if (!email || typeof email !== 'string') return false;
  email = email.toLowerCase().trim();
  if (email.length < 5 || email.length > 100) return false;
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) return false;

  // Reject file extensions falsely matched as TLDs
  const extBlacklist = /\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|woff2|ttf|eot|pdf|zip|mp4)$/i;
  if (extBlacklist.test(email)) return false;

  // Reject common dummy / tracker domains
  const domainPart = email.split('@')[1];
  const blockedDomains = [
    'example.com', 'domain.com', 'yourdomain.com', 'sentry.io', 'wixpress.com',
    'cloudflare.com', 'wordpress.org', 'gravatar.com', 'schema.org', 'googleapis.com',
    'google.com', 'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com',
    'github.com', 'mysite.com', 'test.com', 'email.com', 'w3.org', 'wufoo.com', 'doe.com'
  ];
  if (blockedDomains.some(d => domainPart === d || domainPart.endsWith('.' + d))) return false;

  // Reject dummy prefixes
  const localPart = email.split('@')[0];
  const blockedPrefixes = ['test', 'demo', 'example', 'yourname', 'user', 'name', 'dummy', 'john'];
  if (blockedPrefixes.includes(localPart)) return false;

  return true;
}

// Function to find contact emails for a prospect
async function crawlProspectContactEmails(targetUrl) {
  if (!targetUrl) return { status: 'No Email', contactEmail: null, allFoundEmails: [], emailSource: null };
  let fetchUrl = targetUrl;
  if (!/^https?:\/\//i.test(fetchUrl)) {
    fetchUrl = 'https://' + fetchUrl;
  }
  const baseDomain = normalizeDomain(fetchUrl);

  const allEmails = new Set();
  const emailSourcesMap = new Map();
  let primarySource = null;

  // Helper fetch with modern browser headers & fallback
  const fetchPage = async (url) => {
    const headersList = [
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.5',
        'Upgrade-Insecure-Requests': '1'
      },
      {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9'
      }
    ];

    for (const hdrs of headersList) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: hdrs,
          redirect: 'follow'
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const html = await res.text();
          if (html && html.length > 200) {
            return { html, finalUrl: res.url };
          }
        }
      } catch (e) {}
    }

    // Fallback to Puppeteer if standard fetch was blocked (e.g. Cloudflare / WAF)
    try {
      const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const html = await page.content();
      const finalUrl = page.url();
      await browser.close();
      if (html && html.length > 200) {
        return { html, finalUrl };
      }
    } catch (e) {}

    return null;
  };

  // 1. Fetch homepage
  let homeResult = await fetchPage(fetchUrl);
  if (!homeResult && !fetchUrl.startsWith('https://www.') && fetchUrl.startsWith('https://')) {
    const wwwUrl = fetchUrl.replace('https://', 'https://www.');
    homeResult = await fetchPage(wwwUrl);
  }

  const contactLinks = [];
  if (homeResult?.html) {
    const homeEmails = extractEmailsFromHtml(homeResult.html, baseDomain);
    homeEmails.forEach(e => {
      allEmails.add(e);
      if (!emailSourcesMap.has(e)) emailSourcesMap.set(e, homeResult.finalUrl);
      if (!primarySource) primarySource = homeResult.finalUrl;
    });

    // Find contact page links in HTML
    try {
      const $ = cheerio.load(homeResult.html);
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href')?.trim();
        const text = $(el).text()?.trim().toLowerCase();
        if (!href) return;
        if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|pdf|zip|woff|woff2)$/i.test(href)) return;
        if (/contact|get-in-touch|reach-us|enquir|about/i.test(href) || /contact|get in touch|reach us|enquire|about us/i.test(text)) {
          try {
            const resolved = new URL(href, homeResult.finalUrl).toString();
            const cleanResolved = resolved.split('#')[0];
            if (normalizeDomain(cleanResolved) === baseDomain && !contactLinks.includes(cleanResolved) && cleanResolved !== homeResult.finalUrl) {
              contactLinks.push(cleanResolved);
            }
          } catch (e) {}
        }
      });
    } catch (e) {}
  }

  // If no contact links discovered, probe standard paths
  if (contactLinks.length === 0) {
    const origin = homeResult?.finalUrl ? new URL(homeResult.finalUrl).origin : `https://${baseDomain}`;
    contactLinks.push(`${origin}/contact/`, `${origin}/contact-us/`, `${origin}/about/`);
  }

  // 2. Fetch top contact pages if found
  for (const contactUrl of contactLinks.slice(0, 3)) {
    const contactResult = await fetchPage(contactUrl);
    if (contactResult?.html) {
      const contactEmails = extractEmailsFromHtml(contactResult.html, baseDomain);
      contactEmails.forEach(e => {
        allEmails.add(e);
        if (!emailSourcesMap.has(e)) emailSourcesMap.set(e, contactResult.finalUrl);
        if (!primarySource) primarySource = contactResult.finalUrl;
      });
    }
  }

  // Filter only emails whose domain matches the prospect's own website domain or subdomain
  const domainFilteredEmails = Array.from(allEmails).filter(e => isDomainMatch(e, baseDomain));

  // Pick preferred email: prioritize matching domain with priority prefixes, then any matching domain prefix
  const priorityPrefixes = ['hello@', 'info@', 'enquiries@', 'contact@', 'sales@', 'office@', 'admin@', 'team@'];
  let preferredEmail = null;

  if (domainFilteredEmails.length > 0) {
    // 1. Same domain + priority prefix
    preferredEmail = domainFilteredEmails.find(e => e.endsWith('@' + baseDomain) && priorityPrefixes.some(p => e.startsWith(p)));
    // 2. Same domain any prefix
    if (!preferredEmail) {
      preferredEmail = domainFilteredEmails.find(e => e.endsWith('@' + baseDomain));
    }
    // 3. First domain-matched email
    if (!preferredEmail) {
      preferredEmail = domainFilteredEmails[0];
    }
  }

  const emailSource = preferredEmail ? (emailSourcesMap.get(preferredEmail) || primarySource || fetchUrl) : null;
  const status = preferredEmail ? 'Email Found' : 'No Email';

  return {
    status,
    contactEmail: preferredEmail || null,
    allFoundEmails: domainFilteredEmails,
    emailSource: emailSource
  };
}

const GENERIC_LOCAL_PARTS = new Set([
  'hello', 'info', 'sales', 'contact', 'enquiries', 'enquiry', 'office',
  'admin', 'support', 'team', 'bookings', 'booking', 'help', 'marketing',
  'press', 'media', 'mail', 'service', 'services', 'billing', 'accounts',
  'account', 'general', 'customercare', 'customerservice', 'webmaster',
  'postmaster', 'hostmaster', 'feedback', 'jobs', 'careers', 'reception',
  'orders', 'queries', 'query'
]);

function isDomainMatch(email, prospectDomain) {
  if (!email || !prospectDomain) return false;
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return false;
  const emailDomain = email.substring(atIndex + 1).toLowerCase().trim();
  const cleanProspectDomain = normalizeDomain(prospectDomain).toLowerCase().trim();
  return emailDomain === cleanProspectDomain || emailDomain.endsWith('.' + cleanProspectDomain);
}

function deriveFirstName(email) {
  if (!email) return null;
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return null;
  const localPart = email.substring(0, atIndex).toLowerCase().trim();

  if (GENERIC_LOCAL_PARTS.has(localPart)) return null;

  const parts = localPart.split(/[._-]/).filter(Boolean);
  const candidate = parts[0];

  if (/^[a-z]{2,20}$/i.test(candidate) && !GENERIC_LOCAL_PARTS.has(candidate.toLowerCase())) {
    return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
  }
  return null;
}

function deriveGreeting(email, prospect) {
  const firstName = deriveFirstName(email);
  if (firstName) {
    return `Hi ${firstName},`;
  }
  return 'Hi there,';
}

// Helper to render template variables for a specific prospect and recipient email
function renderTemplate(templateStr, prospect, recipientEmail = null) {
  if (!templateStr) return '';
  const email = recipientEmail || prospect?.contactEmail || (prospect?.allFoundEmails?.[0]) || '';
  const greeting = deriveGreeting(email, prospect);
  const firstName = deriveFirstName(email) || 'there';
  const businessName = prospect?.businessName || prospect?.name || prospect?.domain || '';
  const domain = prospect?.domain || '';
  const location = prospect?.location || 'your area';
  const trade = prospect?.searchPhrase || prospect?.searchKeyword || 'services';

  return templateStr
    .replace(/Hi\s+\{\{\s*businessName\s*\}\}\s+Team,?\s*/gi, `${greeting}\n\n`)
    .replace(/Hi\s+\{\{\s*businessName\s*\}\},?\s*/gi, `${greeting}\n\n`)
    .replace(/Hi\s+\{\{\s*firstName\s*\}\},?/gi, greeting)
    .replace(/\{\{\s*greeting\s*\}\}/gi, greeting)
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstName)
    .replace(/\{\{\s*businessName\s*\}\}/gi, businessName)
    .replace(/\{\{\s*domain\s*\}\}/gi, domain)
    .replace(/\{\{\s*location\s*\}\}/gi, location)
    .replace(/\{\{\s*trade\s*\}\}/gi, trade)
    .replace(/\{\{\s*searchPhrase\s*\}\}/gi, trade)
    .replace(/\{\{\s*searchKeyword\s*\}\}/gi, trade);
}

// Helper to check outbound email provider configuration
function getOutboundEmailConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.OUTBOUND_EMAIL_FROM;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  const isConfigured = Boolean(host && user && pass && from);

  return {
    isConfigured,
    senderMailbox: from || null,
    host: host || null,
    port: port || null,
    user: user || null,
    secure
  };
}

// Helper to generate a partnership outreach email template for a pack
function generatePartnershipTemplate({ searchKeyword, location }) {
  const trade = searchKeyword && searchKeyword !== 'Any' ? searchKeyword : 'services';
  const loc = location && location !== 'Anywhere' ? location : 'your area';

  const subject = `Partnership enquiry: ${trade} in ${loc} — The Search Equation`;
  
  const body = `{{greeting}}

I hope you're having a productive week.

I'm reaching out directly because we are currently looking to partner with an established ${trade} company in ${loc} to generate and deliver additional high-intent client enquiries.

At The Search Equation, we specialise in SEO and digital growth. Rather than offering standard marketing or agency retainers, our model is to invest our own time and digital expertise directly into driving exclusive customer enquiries for a single trusted partner in each sector and region.

We came across {{domain}} while researching established providers in ${loc}, and thought there could be strong commercial synergy between what you do and our growth framework.

If you have capacity for additional ${trade} projects and are open to exploring a collaborative partnership, I’d be glad to share a quick overview of how we work.

Would you be open to a brief 5-minute conversation next week?

Best regards,

Mac
The Search Equation
https://thesearchequation.co.uk`;

  return { subject, body };
}

// POST endpoint to crawl contact emails for a prospect
app.post('/api/outreach-packs/find-contacts', async (req, res) => {
  try {
    const { url, domain } = req.body;
    const target = url || (domain ? `https://${domain}` : '');
    if (!target) return res.status(400).json({ error: 'URL or domain is required' });

    const contactResult = await crawlProspectContactEmails(target);
    res.json(contactResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST endpoint to generate partnership outreach email template
app.post('/api/outreach-packs/generate-template', (req, res) => {
  try {
    const { searchKeyword, location } = req.body;
    const template = generatePartnershipTemplate({ searchKeyword, location });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all outreach packs
app.get('/api/outreach-packs', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM outreach_packs ORDER BY packId DESC');
    const packs = rows.map(r => {
      let parsedProspects = [];
      try {
        parsedProspects = JSON.parse(r.prospects);
      } catch (e) {}
      return {
        ...r,
        prospects: parsedProspects
      };
    });
    res.json(packs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single outreach pack by packId or id
app.get('/api/outreach-packs/:packId', async (req, res) => {
  try {
    const { packId } = req.params;
    const db = await getDb();
    const row = await db.get('SELECT * FROM outreach_packs WHERE packId = ? OR id = ?', [packId, packId]);
    if (!row) return res.status(404).json({ error: 'Outreach pack not found' });
    let parsedProspects = [];
    try {
      parsedProspects = JSON.parse(row.prospects);
    } catch (e) {}
    res.json({
      ...row,
      prospects: parsedProspects
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new outreach pack (with auto contact finding and email draft generation)
app.post('/api/outreach-packs', async (req, res) => {
  try {
    const db = await getDb();
    const { name, templateSubject, templateBody, prospects = [] } = req.body;

    // 1. Generate sequential packId: OP0001, OP0002...
    const rows = await db.all("SELECT packId FROM outreach_packs WHERE packId LIKE 'OP%'");
    let maxNum = 0;
    for (const r of rows) {
      const match = r.packId?.match(/OP(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const nextPackId = `OP${String(maxNum + 1).padStart(4, '0')}`;
    const id = `pack_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const createdAt = new Date().toISOString();

    // 2. Process prospects: populate initial operational statuses
    const processedProspects = [];
    for (const p of prospects) {
      const pDomain = normalizeDomain(p.domain || p.url || '');
      const pUrl = p.url || (pDomain ? `https://${pDomain}` : '');
      const pBusinessName = p.businessName || p.name || pDomain;
      const pSearchKeyword = p.searchKeyword || p.searchPhrase || '';
      const pLocation = p.location || '';

      const hasEmail = Boolean(p.contactEmail);
      const initialStatus = p.sendStatus || (hasEmail ? 'Email Found' : 'No Email');

      processedProspects.push({
        id: p.id || `prospect_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        domain: pDomain,
        url: pUrl,
        businessName: pBusinessName,
        searchId: p.searchId || '',
        searchPhrase: p.searchPhrase || '',
        location: pLocation,
        searchType: p.searchType || 'Organic',
        rank: p.rank || 0,
        opportunityScore: p.opportunityScore ?? null,
        opportunityBand: p.opportunityBand || '',
        commercialStrengthStars: p.commercialStrengthStars || '★★★☆☆',
        commercialStrengthLabel: p.commercialStrengthLabel || 'Good Lead',
        gbpStatus: p.gbpStatus || 'No Profile Matched',
        contactEmail: p.contactEmail || null,
        emailStatus: p.emailStatus || (hasEmail ? 'Email Found' : 'No Email'),
        allFoundEmails: p.allFoundEmails || (p.contactEmail ? [p.contactEmail] : []),
        emailSource: p.emailSource || null,
        sendStatus: initialStatus,
        sentAt: p.sentAt || null,
        analysisData: p.analysisData || null
      });
    }

    let defaultName = name;
    if (!defaultName) {
      const phrases = [...new Set(processedProspects.map(p => (p.searchPhrase || '').trim()).filter(Boolean))];
      const locations = [...new Set(processedProspects.map(p => (p.location || '').trim()).filter(Boolean))];
      if (phrases.length === 1 && locations.length === 1 && locations[0] !== 'Anywhere') {
        defaultName = `${phrases[0]} ${locations[0]}`;
      } else if (phrases.length === 1) {
        defaultName = phrases[0];
      } else {
        defaultName = `Outreach Pack ${nextPackId}`;
      }
    }

    // Default template for pack
    const firstPhrase = processedProspects[0]?.searchPhrase || processedProspects[0]?.searchKeyword || '';
    const firstLoc = processedProspects[0]?.location || '';
    const defaultTemplate = generatePartnershipTemplate({ searchKeyword: firstPhrase, location: firstLoc });

    const finalTemplateSubject = templateSubject || defaultTemplate.subject;
    const finalTemplateBody = templateBody || defaultTemplate.body;

    await db.run(
      `INSERT INTO outreach_packs (id, packId, name, templateSubject, templateBody, createdAt, sentAt, status, prospectsCount, prospects)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        nextPackId,
        defaultName,
        finalTemplateSubject,
        finalTemplateBody,
        createdAt,
        null,
        'Draft',
        processedProspects.length,
        JSON.stringify(processedProspects)
      ]
    );

    // Record in contact history
    for (const p of processedProspects) {
      await db.run(
        `INSERT OR REPLACE INTO outreach_contact_history (id, domain, email, packId, status, sentAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `hist_${nextPackId}_${p.domain}`,
          p.domain,
          p.contactEmail || null,
          nextPackId,
          p.sendStatus || 'No Email',
          null,
          createdAt
        ]
      );
    }

    res.json({
      success: true,
      pack: {
        id,
        packId: nextPackId,
        name: defaultName,
        templateSubject: finalTemplateSubject,
        templateBody: finalTemplateBody,
        createdAt,
        sentAt: null,
        status: 'Draft',
        prospectsCount: processedProspects.length,
        prospects: processedProspects
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update outreach pack (e.g. edit pack template, update contact email, change status)
app.put('/api/outreach-packs/:packId', async (req, res) => {
  try {
    const { packId } = req.params;
    const { name, templateSubject, templateBody, status, sentAt, prospects } = req.body;
    const db = await getDb();

    const existing = await db.get('SELECT * FROM outreach_packs WHERE packId = ? OR id = ?', [packId, packId]);
    if (!existing) return res.status(404).json({ error: 'Outreach pack not found' });

    const updatedName = name !== undefined ? name : existing.name;
    const updatedTemplateSubject = templateSubject !== undefined ? templateSubject : (existing.templateSubject || null);
    const updatedTemplateBody = templateBody !== undefined ? templateBody : (existing.templateBody || null);
    const updatedStatus = status !== undefined ? status : existing.status;
    const updatedSentAt = sentAt !== undefined ? sentAt : existing.sentAt;
    const updatedProspects = prospects !== undefined ? (typeof prospects === 'string' ? prospects : JSON.stringify(prospects)) : existing.prospects;
    const parsedProspects = typeof updatedProspects === 'string' ? JSON.parse(updatedProspects) : updatedProspects;

    await db.run(
      `UPDATE outreach_packs 
       SET name = ?, templateSubject = ?, templateBody = ?, status = ?, sentAt = ?, prospectsCount = ?, prospects = ?
       WHERE packId = ? OR id = ?`,
      [
        updatedName,
        updatedTemplateSubject,
        updatedTemplateBody,
        updatedStatus,
        updatedSentAt,
        parsedProspects.length,
        typeof updatedProspects === 'string' ? updatedProspects : JSON.stringify(updatedProspects),
        packId,
        packId
      ]
    );

    // Update contact history
    for (const p of parsedProspects) {
      await db.run(
        `INSERT OR REPLACE INTO outreach_contact_history (id, domain, email, packId, status, sentAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `hist_${existing.packId}_${p.domain}`,
          p.domain,
          p.contactEmail || null,
          existing.packId,
          p.sendStatus || 'No Email',
          p.sentAt || null,
          existing.createdAt
        ]
      );
    }

    res.json({
      success: true,
      pack: {
        ...existing,
        name: updatedName,
        templateSubject: updatedTemplateSubject,
        templateBody: updatedTemplateBody,
        status: updatedStatus,
        sentAt: updatedSentAt,
        prospectsCount: parsedProspects.length,
        prospects: parsedProspects
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET sender status
app.get('/api/outreach/sender-status', (req, res) => {
  const config = getOutboundEmailConfig();
  res.json({
    configured: config.isConfigured,
    senderMailbox: config.senderMailbox,
    host: config.host,
    port: config.port
  });
});

// POST send selected prospects in outreach pack
app.post('/api/outreach-packs/:packId/send', async (req, res) => {
  try {
    const { packId } = req.params;
    const { selectedProspectIds = [] } = req.body;
    const config = getOutboundEmailConfig();

    if (!config.isConfigured) {
      return res.status(400).json({
        success: false,
        configured: false,
        error: 'No outbound email provider is currently configured in the server environment. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM to enable sending.'
      });
    }

    const db = await getDb();
    const packRow = await db.get('SELECT * FROM outreach_packs WHERE packId = ? OR id = ?', [packId, packId]);
    if (!packRow) return res.status(404).json({ error: 'Outreach pack not found' });

    let prospects = [];
    try {
      prospects = JSON.parse(packRow.prospects);
    } catch (e) {
      prospects = [];
    }

    const templateSubject = packRow.templateSubject || '';
    const templateBody = packRow.templateBody || '';

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: process.env.SMTP_PASS
      }
    });

    const nowIso = new Date().toISOString();
    const sendResults = [];

    // Filter prospects to send
    const targetProspects = selectedProspectIds.length > 0
      ? prospects.filter(p => selectedProspectIds.includes(p.id) || selectedProspectIds.includes(p.domain))
      : prospects;

    for (let i = 0; i < prospects.length; i++) {
      const p = prospects[i];
      const isTarget = targetProspects.some(tp => (tp.id && tp.id === p.id) || tp.domain === p.domain);
      if (!isTarget) continue;

      // Extract all valid domain-matched emails only
      const emails = Array.from(new Set([p.contactEmail, ...(p.allFoundEmails || [])].filter(Boolean)))
        .filter(email => isDomainMatch(email, p.domain));

      if (emails.length === 0) {
        p.sendStatus = 'No Email';
        continue;
      }

      // Check duplicate send protection: if already sent, skip
      if (p.sendStatus === 'Sent') {
        sendResults.push({ prospectId: p.id, domain: p.domain, skipped: true, reason: 'Already sent' });
        continue;
      }

      const emailResults = [];
      let anySuccess = false;

      for (const email of emails) {
        try {
          const renderedSubject = renderTemplate(templateSubject, p, email);
          const renderedBody = renderTemplate(templateBody, p, email);

          const mailOptions = {
            from: config.senderMailbox,
            to: email,
            subject: renderedSubject,
            text: renderedBody
          };

          const info = await transporter.sendMail(mailOptions);
          emailResults.push({ email, status: 'Sent', messageId: info.messageId, sentAt: nowIso });
          anySuccess = true;
        } catch (err) {
          console.error(`[Email Send Error] Failed sending to ${email}:`, err);
          emailResults.push({ email, status: 'Failed', error: err.message, failedAt: nowIso });
        }
      }

      p.sendHistory = [...(p.sendHistory || []), ...emailResults];
      p.sendStatus = anySuccess ? 'Sent' : 'Failed';
      if (anySuccess) {
        p.sentAt = nowIso;
      }

      // Update contact history in SQLite
      await db.run(
        `INSERT OR REPLACE INTO outreach_contact_history (id, domain, email, packId, status, sentAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `hist_${packRow.packId}_${p.domain}`,
          p.domain,
          p.contactEmail || emails[0],
          packRow.packId,
          p.sendStatus,
          p.sentAt || null,
          packRow.createdAt
        ]
      );

      sendResults.push({ prospectId: p.id, domain: p.domain, emails: emailResults, status: p.sendStatus });
    }

    // Determine overall pack status
    const allSent = prospects.every(p => p.sendStatus === 'Sent');
    const anySent = prospects.some(p => p.sendStatus === 'Sent');
    const newPackStatus = allSent ? 'Sent' : (anySent ? 'Partially Sent' : (packRow.status || 'Draft'));
    const packSentAt = anySent ? (packRow.sentAt || nowIso) : packRow.sentAt;

    await db.run(
      `UPDATE outreach_packs
       SET status = ?, sentAt = ?, prospects = ?
       WHERE packId = ? OR id = ?`,
      [
        newPackStatus,
        packSentAt,
        JSON.stringify(prospects),
        packRow.packId,
        packRow.packId
      ]
    );

    res.json({
      success: true,
      pack: {
        ...packRow,
        status: newPackStatus,
        sentAt: packSentAt,
        prospects
      },
      results: sendResults
    });
  } catch (error) {
    console.error('Error in send pack endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE outreach pack
app.delete('/api/outreach-packs/:packId', async (req, res) => {
  try {
    const { packId } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM outreach_packs WHERE packId = ? OR id = ?', [packId, packId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET contact history (for duplicate-send protection check)
app.get('/api/outreach/history', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM outreach_contact_history ORDER BY createdAt DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Root check endpoint
app.get('/', (req, res) => {
  res.send('Lead Gen Backend is running.');
});

const execPromise = util.promisify(exec);

// GET milestones endpoint
app.get('/api/milestones', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(__dirname, 'milestones.json'), 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST milestones create endpoint
app.post('/api/milestones/create', async (req, res) => {
  const { version, summary, features, bugfixes, notes, rollback, walkthroughPath } = req.body;
  
  if (!version || !summary) {
    return res.status(400).json({ error: 'Version and summary are required' });
  }

  const milestonesFilePath = path.join(__dirname, 'milestones.json');
  
  try {
    let milestones = [];
    try {
      const fileData = await fs.readFile(milestonesFilePath, 'utf8');
      milestones = JSON.parse(fileData);
    } catch (e) {
      // Start empty if not found
    }

    if (milestones.some(m => m.version.toLowerCase() === version.toLowerCase())) {
      return res.status(400).json({ error: `Version ${version} already exists` });
    }

    const gitTag = `${version.toLowerCase()}`;
    const dateStr = new Date().toISOString();
    
    const newMilestone = {
      version,
      date: dateStr,
      status: 'Released',
      gitTag,
      commitHash: 'PENDING',
      summary,
      features: Array.isArray(features) ? features : (features ? [features] : []),
      bugfixes: Array.isArray(bugfixes) ? bugfixes : (bugfixes ? [bugfixes] : []),
      notes: notes || '',
      rollback: rollback || `git checkout ${gitTag}`
    };

    milestones.push(newMilestone);
    await fs.writeFile(milestonesFilePath, JSON.stringify(milestones, null, 2), 'utf8');

    // 1. Stage and commit
    await execPromise('git add .');
    await execPromise(`git commit -m "feat: complete ${version} milestone"`);
    
    // 2. Get commit hash
    const { stdout: hashStdout } = await execPromise('git rev-parse HEAD');
    const commitHash = hashStdout.trim();
    
    // 3. Update internal JSON with the correct hash
    newMilestone.commitHash = commitHash;
    milestones[milestones.length - 1] = newMilestone;
    await fs.writeFile(milestonesFilePath, JSON.stringify(milestones, null, 2), 'utf8');
    
    // Amend commit to incorporate hash inside milestones.json
    await execPromise('git add milestones.json');
    await execPromise('git commit --amend --no-edit');
    
    // 4. Push commit
    await execPromise('git push');

    // 5. Create tag and push tag
    await execPromise(`git tag ${gitTag}`);
    await execPromise(`git push origin ${gitTag}`);

    // 6. Update walkthrough.md
    if (walkthroughPath) {
      const walkContent = `\n\n# Milestone: ${version} ${summary}\n\nThis section documents the features and bug fixes completed in version ${version} released on ${new Date(dateStr).toLocaleDateString()}.\n\n## Features Completed\n${newMilestone.features.map(f => `- ${f}`).join('\n')}\n\n## Bug Fixes\n${newMilestone.bugfixes.map(b => `- ${b}`).join('\n')}\n\n## Developer Notes\n${newMilestone.notes || 'None.'}\n`;
      await fs.appendFile(walkthroughPath, walkContent, 'utf8');
    }

    res.json({ success: true, milestone: newMilestone });
  } catch (error) {
    console.error('Milestone creation failed:', error);
    res.status(500).json({ error: error.message });
  }
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
