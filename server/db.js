import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

export async function getDb() {
  if (db) return db;
  
  db = await open({
    filename: path.join(__dirname, 'database.db'),
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
    )
  `);
  
  return db;
}
