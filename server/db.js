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
      templateSubject TEXT,
      templateBody TEXT,
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

  try {
    await db.exec(`ALTER TABLE outreach_packs ADD COLUMN templateSubject TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_packs ADD COLUMN templateBody TEXT;`);
  } catch (e) {}

  await cleanNonDomainEmails(db);
  await cleanPackTemplateGreetings(db);
  
  return db;
}

// Strip leading manual greetings or variables from template body so greeting is separate & automatic
export function stripLeadingGreeting(body) {
  if (!body) return '';
  let cleaned = body;
  const greetingPattern = /^\s*(?:(?:Hi|Hello|Hey|Dear)\b[^\n]*|\{\{\s*(?:greeting|firstName|businessName)\s*\}\}[^\n]*)(?:\r?\n)+/i;
  while (greetingPattern.test(cleaned)) {
    cleaned = cleaned.replace(greetingPattern, '');
  }
  return cleaned.trimStart();
}

// Clean stored outreach packs to ensure template body does not retain manual greetings (like Hi Jon)
export async function cleanPackTemplateGreetings(database) {
  try {
    const packs = await database.all('SELECT id, packId, templateBody FROM outreach_packs');
    for (const pack of packs) {
      if (pack.templateBody) {
        const cleanedBody = stripLeadingGreeting(pack.templateBody);
        if (cleanedBody !== pack.templateBody) {
          await database.run(
            'UPDATE outreach_packs SET templateBody = ? WHERE id = ? OR packId = ?',
            [cleanedBody, pack.id, pack.packId]
          );
        }
      }
    }
  } catch (err) {
    console.error('Error cleaning template greetings:', err);
  }
}

// Clean existing packs and history to filter out non-matching domain emails
export async function cleanNonDomainEmails(database) {
  try {
    const packs = await database.all('SELECT * FROM outreach_packs');
    for (const pack of packs) {
      let prospects = [];
      try {
        prospects = JSON.parse(pack.prospects);
      } catch (e) {
        continue;
      }
      let modified = false;
      for (const p of prospects) {
        const domain = p.domain || p.url || '';
        if (!domain) continue;

        const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].trim();
        const isMatch = (email) => {
          if (!email) return false;
          const atIdx = email.lastIndexOf('@');
          if (atIdx === -1) return false;
          const emailDom = email.substring(atIdx + 1).toLowerCase().trim();
          return emailDom === cleanDomain || emailDom.endsWith('.' + cleanDomain);
        };

        const origAll = p.allFoundEmails || [];
        const filteredAll = origAll.filter(isMatch);
        let contactEmail = p.contactEmail;

        if (contactEmail && !isMatch(contactEmail)) {
          contactEmail = filteredAll.length > 0 ? filteredAll[0] : null;
          modified = true;
        }
        if (filteredAll.length !== origAll.length) {
          p.allFoundEmails = filteredAll;
          modified = true;
        }
        if (!contactEmail && filteredAll.length > 0) {
          contactEmail = filteredAll[0];
          modified = true;
        }
        p.contactEmail = contactEmail;
        if (!p.contactEmail) {
          p.sendStatus = 'No Email';
          p.emailStatus = 'No Email';
        } else {
          p.sendStatus = p.sendStatus === 'Sent' ? 'Sent' : 'Email Found';
          p.emailStatus = 'Email Found';
        }
      }

      if (modified) {
        await database.run(
          'UPDATE outreach_packs SET prospects = ? WHERE packId = ? OR id = ?',
          [JSON.stringify(prospects), pack.packId, pack.id]
        );
      }
    }

    // Clean outreach_contact_history
    const history = await database.all('SELECT * FROM outreach_contact_history');
    for (const h of history) {
      if (h.email && h.domain) {
        const cleanDomain = h.domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].trim();
        const atIdx = h.email.lastIndexOf('@');
        const emailDom = atIdx !== -1 ? h.email.substring(atIdx + 1).toLowerCase().trim() : '';
        if (emailDom && emailDom !== cleanDomain && !emailDom.endsWith('.' + cleanDomain)) {
          await database.run('DELETE FROM outreach_contact_history WHERE id = ?', [h.id]);
        }
      }
    }
  } catch (err) {
    console.error('Error cleaning non-domain emails:', err);
  }
}


