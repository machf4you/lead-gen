import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

export async function getDb() {
  if (db) return db;
  
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.db');
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
  // Create table with camelCase column names to match the frontend expectations
  await db.exec(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      searchId TEXT NOT NULL,
      searchType TEXT NOT NULL,
      businessType TEXT NOT NULL,
      location TEXT NOT NULL,
      searchMode TEXT NOT NULL,
      dateTime TEXT NOT NULL,
      count INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS excluded_domains (
      domain TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outreach_shortlist (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      url TEXT,
      businessName TEXT,
      searchId TEXT,
      searchPhrase TEXT,
      location TEXT,
      searchType TEXT,
      rank INTEGER,
      opportunityScore INTEGER,
      opportunityBand TEXT,
      commercialStrengthStars TEXT,
      commercialStrengthLabel TEXT,
      commercialStrengthPoints INTEGER,
      gbpStatus TEXT,
      analysisData TEXT,
      shortlistedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outreach_packs (
      id TEXT PRIMARY KEY,
      packId TEXT NOT NULL UNIQUE,
      name TEXT,
      createdAt TEXT NOT NULL,
      sentAt TEXT,
      status TEXT NOT NULL DEFAULT 'Draft',
      prospectsCount INTEGER NOT NULL DEFAULT 0,
      prospects TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outreach_contact_history (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      email TEXT,
      packId TEXT NOT NULL,
      status TEXT NOT NULL,
      sentAt TEXT,
      createdAt TEXT NOT NULL
    );
  `);
  
  return db;
}


