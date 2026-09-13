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

    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  try {
    await db.exec(`ALTER TABLE outreach_packs ADD COLUMN templateSubject TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_packs ADD COLUMN templateBody TEXT;`);
  } catch (e) {}

  await initDefaultSettings(db);
  await cleanNonDomainEmails(db);
  await cleanPackTemplateGreetings(db);
  await seedDefaultEmailTemplates(db);
  await migrateSenderVariablesInTemplates(db);
  
  return db;
}

// Initialize default app settings in database
export async function initDefaultSettings(database) {
  try {
    const defaults = {
      sender_first_name: 'Mac',
      sender_name: 'Mac McCarthy',
      company_name: 'The Search Equation'
    };
    for (const [key, val] of Object.entries(defaults)) {
      const existing = await database.get('SELECT key FROM app_settings WHERE key = ?', [key]);
      if (!existing) {
        await database.run('INSERT INTO app_settings (key, value) VALUES (?, ?)', [key, val]);
      }
    }
  } catch (e) {
    console.error('Error initializing default settings:', e);
  }
}

// Get outreach sender settings from database
export async function getSenderSettings(database) {
  try {
    const rows = await database.all('SELECT key, value FROM app_settings');
    const settings = {
      sender_first_name: 'Mac',
      sender_name: 'Mac McCarthy',
      company_name: 'The Search Equation'
    };
    for (const r of rows) {
      if (r.key in settings) {
        settings[r.key] = r.value;
      }
    }
    return settings;
  } catch (e) {
    return {
      sender_first_name: 'Mac',
      sender_name: 'Mac McCarthy',
      company_name: 'The Search Equation'
    };
  }
}

// Update outreach sender settings in database
export async function updateSenderSettings(database, newSettings) {
  for (const key of ['sender_first_name', 'sender_name', 'company_name']) {
    if (newSettings[key] !== undefined) {
      await database.run(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, String(newSettings[key]).trim()]
      );
    }
  }
  return getSenderSettings(database);
}

// Seed default master email templates if none exist
export async function seedDefaultEmailTemplates(database) {
  try {
    const existing = await database.all('SELECT id, name FROM email_templates');
    const existingNames = new Set(existing.map(t => t.name.toLowerCase()));

    const defaults = [
      {
        id: 'tpl_warm_partnership',
        name: 'Warm Partnership / Investment Approach',
        subject: 'Partnership enquiry: {{trade}} in {{location}} — {{company_name}}',
        body: `I hope you're having a productive week.

I'm reaching out directly because we are currently looking to partner with an established {{trade}} company in {{location}} to generate and deliver additional high-intent client enquiries.

At {{company_name}}, we specialise in SEO and digital growth. Rather than offering standard marketing or agency retainers, our model is to invest our own time and digital expertise directly into driving exclusive customer enquiries for a single trusted partner in each sector and region.

We came across {{domain}} while researching established providers in {{location}}, and thought there could be strong commercial synergy between what you do and our growth framework.

If you have capacity for additional {{trade}} projects and are open to exploring a collaborative partnership, I’d be glad to share a quick overview of how we work.

Best regards,

{{sender_name}}
{{company_name}}`
      },
      {
        id: 'tpl_standard_seo',
        name: 'Standard SEO Introduction',
        subject: 'Quick question regarding search visibility for {{domain}}',
        body: `I was researching local {{trade}} providers in {{location}} and noticed {{domain}} ranking in Google search results.

You have a strong foundation, but there are a few straightforward technical and local search adjustments that would significantly increase your direct customer enquiries.

I've put together a brief checklist of the highest-impact opportunities for your site. Would it be alright if I sent that over?

Best regards,

{{sender_name}}
{{company_name}}`
      }
    ];

    const now = new Date().toISOString();
    for (const tpl of defaults) {
      if (!existingNames.has(tpl.name.toLowerCase())) {
        await database.run(
          `INSERT INTO email_templates (id, name, subject, body, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
          [tpl.id, tpl.name, tpl.subject, tpl.body, now, now]
        );
      }
    }
  } catch (err) {
    console.error('Error seeding default email templates:', err);
  }
}

// Migrate any existing templates and packs to replace hard-coded sender/company references with variables
export async function migrateSenderVariablesInTemplates(database) {
  try {
    const templates = await database.all('SELECT * FROM email_templates');
    for (const tpl of templates) {
      let newSubject = tpl.subject;
      let newBody = tpl.body;

      newSubject = newSubject
        .replace(/—\s*The Search Equation/gi, '— {{company_name}}')
        .replace(/The Search Equation/gi, '{{company_name}}');

      newBody = newBody
        .replace(/At The Search Equation/gi, 'At {{company_name}}')
        .replace(/The Search Equation/gi, '{{company_name}}')
        .replace(/Mac McCarthy/gi, '{{sender_name}}')
        .replace(/My name is Mac\b/gi, 'My name is {{sender_first_name}}')
        .replace(/\nMac\n/g, '\n{{sender_name}}\n')
        .replace(/\nMac\r\n/g, '\n{{sender_name}}\r\n');

      if (newSubject !== tpl.subject || newBody !== tpl.body) {
        await database.run(
          'UPDATE email_templates SET subject = ?, body = ?, updatedAt = ? WHERE id = ?',
          [newSubject, newBody, new Date().toISOString(), tpl.id]
        );
      }
    }

    const packs = await database.all('SELECT id, packId, templateSubject, templateBody FROM outreach_packs');
    for (const p of packs) {
      let newSub = p.templateSubject || '';
      let newB = p.templateBody || '';

      if (newSub) {
        newSub = newSub
          .replace(/—\s*The Search Equation/gi, '— {{company_name}}')
          .replace(/The Search Equation/gi, '{{company_name}}');
      }
      if (newB) {
        newB = newB
          .replace(/At The Search Equation/gi, 'At {{company_name}}')
          .replace(/The Search Equation/gi, '{{company_name}}')
          .replace(/Mac McCarthy/gi, '{{sender_name}}')
          .replace(/My name is Mac\b/gi, 'My name is {{sender_first_name}}')
          .replace(/\nMac\n/g, '\n{{sender_name}}\n')
          .replace(/\nMac\r\n/g, '\n{{sender_name}}\r\n');
      }

      if (newSub !== p.templateSubject || newB !== p.templateBody) {
        await database.run(
          'UPDATE outreach_packs SET templateSubject = ?, templateBody = ? WHERE id = ? OR packId = ?',
          [newSub, newB, p.id, p.packId]
        );
      }
    }
  } catch (err) {
    console.error('Error migrating sender variables in templates:', err);
  }
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


