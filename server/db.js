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
      data TEXT NOT NULL,
      workspace TEXT NOT NULL DEFAULT 'tse'
    );

    CREATE TABLE IF NOT EXISTS excluded_domains (
      domain TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      workspace TEXT NOT NULL DEFAULT 'tse',
      PRIMARY KEY (domain, workspace)
    );

    CREATE TABLE IF NOT EXISTS outreach_shortlist (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
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
      shortlistedAt TEXT NOT NULL,
      workspace TEXT NOT NULL DEFAULT 'tse'
    );

    CREATE TABLE IF NOT EXISTS outreach_packs (
      id TEXT PRIMARY KEY,
      packId TEXT NOT NULL,
      name TEXT,
      templateSubject TEXT,
      templateBody TEXT,
      createdAt TEXT NOT NULL,
      sentAt TEXT,
      status TEXT NOT NULL DEFAULT 'Draft',
      prospectsCount INTEGER NOT NULL DEFAULT 0,
      prospects TEXT NOT NULL,
      workspace TEXT NOT NULL DEFAULT 'tse'
    );

    CREATE TABLE IF NOT EXISTS outreach_contact_history (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      email TEXT,
      packId TEXT NOT NULL,
      status TEXT NOT NULL,
      sentAt TEXT,
      createdAt TEXT NOT NULL,
      workspace TEXT NOT NULL DEFAULT 'tse'
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
      workspace TEXT NOT NULL DEFAULT 'tse',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (workspace, key)
    );

    CREATE TABLE IF NOT EXISTS sent_email_history (
      id TEXT PRIMARY KEY,
      sentAt TEXT NOT NULL,
      domain TEXT NOT NULL,
      email TEXT NOT NULL,
      templateId TEXT,
      templateName TEXT,
      prospectId TEXT,
      packId TEXT,
      subject TEXT,
      body TEXT,
      workspace TEXT NOT NULL DEFAULT 'tse'
    );
  `);

  try {
    await db.exec(`ALTER TABLE outreach_packs ADD COLUMN templateSubject TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_packs ADD COLUMN templateBody TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_packs ADD COLUMN searchType TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_shortlist ADD COLUMN phone TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_shortlist ADD COLUMN address TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_shortlist ADD COLUMN rating REAL;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_shortlist ADD COLUMN reviewsCount INTEGER;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_shortlist ADD COLUMN contactEmail TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_shortlist ADD COLUMN emailStatus TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_shortlist ADD COLUMN allFoundEmails TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE email_templates ADD COLUMN templateType TEXT DEFAULT 'master';`);
  } catch (e) {}

  // Workspace migrations for multi-user workspace separation
  try {
    await db.exec(`ALTER TABLE saved_searches ADD COLUMN workspace TEXT DEFAULT 'tse';`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_shortlist ADD COLUMN workspace TEXT DEFAULT 'tse';`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_packs ADD COLUMN workspace TEXT DEFAULT 'tse';`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE outreach_contact_history ADD COLUMN workspace TEXT DEFAULT 'tse';`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE excluded_domains ADD COLUMN workspace TEXT DEFAULT 'tse';`);
  } catch (e) {}

  // Migrate app_settings to composite primary key (workspace, key)
  try {
    const cols = await db.all("PRAGMA table_info(app_settings)");
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('workspace')) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings_workspace_mig (
          workspace TEXT NOT NULL DEFAULT 'tse',
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (workspace, key)
        );
        INSERT OR REPLACE INTO app_settings_workspace_mig (workspace, key, value)
        SELECT 'tse', key, value FROM app_settings;
        DROP TABLE app_settings;
        ALTER TABLE app_settings_workspace_mig RENAME TO app_settings;
      `);
    }
  } catch (e) {
    console.error('Migration note for app_settings:', e);
  }

  await initDefaultSettings(db);
  await cleanNonDomainEmails(db);
  await cleanPackTemplateGreetings(db);
  await migrateExistingSentHistory(db);
  await seedDefaultEmailTemplates(db);
  await migrateSenderVariablesInTemplates(db);
  await migrateTemplateClassifications(db);
  await repairAndMigratePackIds(db);
  await migrateCompanyDomains(db);
  
  return db;
}

const MULTI_PART_TLD_PREFIXES = new Set([
  'co', 'com', 'org', 'net', 'ltd', 'plc', 'me', 'gov', 'ac', 'sch', 
  'nhs', 'police', 'mod', 'edu', 'asso', 'firm', 'gen', 'ind', 'nom', 'tm', 'web', 'ne', 'or', 'gr'
]);

export function normalizeCompanyDomain(urlOrDomain) {
  if (!urlOrDomain) return '';
  let str = String(urlOrDomain).trim().toLowerCase();
  if (str.includes('://')) {
    try {
      str = new URL(str).hostname;
    } catch (e) {
      str = str.replace(/^[a-z0-9+.-]+:\/\//i, '').split('/')[0];
    }
  } else {
    str = str.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  }
  
  str = str.replace(/:\d+$/, '').replace(/^\.+|\.+$/g, '').trim();
  
  while (str.startsWith('www.') || str.startsWith('www1.') || str.startsWith('www2.')) {
    str = str.split('.').slice(1).join('.');
  }

  const parts = str.split('.');
  if (parts.length <= 1) {
    return str;
  }

  const tld = parts[parts.length - 1];
  const penultimate = parts[parts.length - 2];

  if (tld.length === 2 && MULTI_PART_TLD_PREFIXES.has(penultimate)) {
    if (parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return parts.join('.');
  }

  return parts.slice(-2).join('.');
}

export async function migrateCompanyDomains(database) {
  try {
    const shortlistRows = await database.all('SELECT id, domain, url FROM outreach_shortlist');
    for (const r of shortlistRows) {
      const cleanDom = normalizeCompanyDomain(r.domain || r.url);
      if (cleanDom && cleanDom !== r.domain) {
        await database.run('UPDATE outreach_shortlist SET domain = ? WHERE id = ?', [cleanDom, r.id]);
      }
    }

    const historyRows = await database.all('SELECT id, domain FROM outreach_contact_history');
    for (const h of historyRows) {
      const cleanDom = normalizeCompanyDomain(h.domain);
      if (cleanDom && cleanDom !== h.domain) {
        await database.run('UPDATE outreach_contact_history SET domain = ? WHERE id = ?', [cleanDom, h.id]);
      }
    }
  } catch (e) {
    console.error('Error migrating company domains:', e);
  }
}

// Initialize default app settings in database per workspace
export async function initDefaultSettings(database) {
  try {
    const workspaceDefaults = {
      tse: {
        sender_first_name: 'Mac',
        sender_name: 'Mac McCarthy',
        company_name: 'The Search Equation'
      },
      smoking_chili: {
        sender_first_name: 'Darren',
        sender_name: 'Darren',
        company_name: 'Smoking Chili Media'
      }
    };

    for (const [ws, defaults] of Object.entries(workspaceDefaults)) {
      for (const [key, val] of Object.entries(defaults)) {
        const existing = await database.get('SELECT key FROM app_settings WHERE workspace = ? AND key = ?', [ws, key]);
        if (!existing) {
          await database.run('INSERT INTO app_settings (workspace, key, value) VALUES (?, ?, ?)', [ws, key, val]);
        }
      }
    }
  } catch (e) {
    console.error('Error initializing default settings:', e);
  }
}

// Get outreach sender settings from database for specific workspace
export async function getSenderSettings(database, workspace = 'tse') {
  const ws = String(workspace || 'tse').trim().toLowerCase();
  const defaultForWs = ws === 'smoking_chili' ? {
    sender_first_name: 'Darren',
    sender_name: 'Darren',
    company_name: 'Smoking Chili Media'
  } : {
    sender_first_name: 'Mac',
    sender_name: 'Mac McCarthy',
    company_name: 'The Search Equation'
  };

  try {
    const rows = await database.all('SELECT key, value FROM app_settings WHERE workspace = ?', [ws]);
    const settings = { ...defaultForWs };
    for (const r of rows) {
      if (r.key in settings) {
        settings[r.key] = r.value;
      }
    }
    return settings;
  } catch (e) {
    return defaultForWs;
  }
}

// Update outreach sender settings in database for specific workspace
export async function updateSenderSettings(database, newSettings, workspace = 'tse') {
  const ws = String(workspace || 'tse').trim().toLowerCase();
  for (const key of ['sender_first_name', 'sender_name', 'company_name']) {
    if (newSettings[key] !== undefined) {
      await database.run(
        'INSERT INTO app_settings (workspace, key, value) VALUES (?, ?, ?) ON CONFLICT(workspace, key) DO UPDATE SET value = excluded.value',
        [ws, key, String(newSettings[key]).trim()]
      );
    }
  }
  return getSenderSettings(database, ws);
}

// Seed default master email templates - DISABLED (no automatic template creation)
export async function seedDefaultEmailTemplates(database) {
  // Automatic template seeding has been disabled.
  // Existing templates are preserved and no new templates are inserted on startup.
  return;
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

// Explicitly classify stored templates by templateType (master | organic | local) based on LOCAL - / ORGANIC - prefix
export async function migrateTemplateClassifications(database) {
  try {
    const templates = await database.all('SELECT * FROM email_templates');
    for (const tpl of templates) {
      const name = (tpl.name || '').trim();
      const lowerName = name.toLowerCase();
      let targetType = tpl.templateType;

      // 1. Prefix priority: LOCAL - or ORGANIC -
      if (lowerName.startsWith('local -') || lowerName.startsWith('local-') || lowerName.startsWith('local:')) {
        targetType = 'local';
      } else if (lowerName.startsWith('organic -') || lowerName.startsWith('organic-') || lowerName.startsWith('organic:')) {
        targetType = 'organic';
      } else if (lowerName.startsWith('master -') || lowerName.startsWith('master-') || lowerName.startsWith('master:')) {
        targetType = 'master';
      } else if (tpl.id === 'tpl_local_partnership_long' || tpl.id === 'tpl_local_standard_short' || tpl.id === 'tpl_local_partnership_short') {
        targetType = 'local';
      } else if (tpl.id === 'tpl_warm_partnership' || tpl.id === 'tpl_standard_seo' || tpl.id === 'tpl_organic_partnership_short' || tpl.id === 'tpl_1789277829032' || tpl.id === 'tpl_1789395845089') {
        targetType = 'organic';
      } else if (!targetType || targetType === 'master') {
        // Fallback for custom templates
        if (tpl.id.startsWith('tpl_local') || lowerName.includes('(local)')) {
          targetType = 'local';
        } else if (tpl.id.startsWith('tpl_organic') || lowerName.includes('(organic)')) {
          targetType = 'organic';
        } else {
          targetType = targetType || 'master';
        }
      }

      if (targetType && targetType !== tpl.templateType) {
        await database.run('UPDATE email_templates SET templateType = ? WHERE id = ?', [targetType, tpl.id]);
      }
    }
  } catch (err) {
    console.error('Error migrating template classifications:', err);
  }
}

// Repair and migrate pack IDs ensuring ZERO TEMP_ values and exact GM/OR mapping
export async function repairAndMigratePackIds(database) {
  try {
    const packs = await database.all('SELECT * FROM outreach_packs ORDER BY createdAt ASC');

    // Specific mapping for known production packs
    const fixedMap = {
      'pack_1789396132168_zj63': { packId: 'GM0001', searchType: 'GMB' },
      'pack_1789397185612_cvqp': { packId: 'GM0002', searchType: 'GMB' },
      'pack_1789047202106_bvdw': { packId: 'OR0001', searchType: 'Organic' },
      'pack_1789053668722_onyn': { packId: 'OR0002', searchType: 'Organic' },
      'pack_1789397206700_a0y6': { packId: 'OR0003', searchType: 'Organic' }
    };

    // Update known packs directly
    for (const p of packs) {
      if (fixedMap[p.id]) {
        const target = fixedMap[p.id];
        if (p.packId !== target.packId || p.searchType !== target.searchType) {
          // If conflict with existing packId, update directly
          await database.run('UPDATE outreach_packs SET packId = ?, searchType = ? WHERE id = ?', [target.packId, target.searchType, p.id]);
        }
      }
    }

    // Clean up any remaining TEMP_ or OP packs for any other rows
    const allPacks = await database.all('SELECT * FROM outreach_packs ORDER BY createdAt ASC');
    let maxGm = 2;
    let maxOr = 3;
    for (const p of allPacks) {
      if (!fixedMap[p.id]) {
        if (!p.packId || p.packId.startsWith('TEMP_') || p.packId.startsWith('OP')) {
          const isGmb = p.searchType === 'GMB' || p.searchType === 'local';
          if (isGmb) {
            maxGm++;
            const newId = `GM${String(maxGm).padStart(4, '0')}`;
            await database.run('UPDATE outreach_packs SET packId = ?, searchType = ? WHERE id = ?', [newId, 'GMB', p.id]);
          } else {
            maxOr++;
            const newId = `OR${String(maxOr).padStart(4, '0')}`;
            await database.run('UPDATE outreach_packs SET packId = ?, searchType = ? WHERE id = ?', [newId, 'Organic', p.id]);
          }
        }
      }
    }

    // Clean outreach_contact_history
    const history = await database.all('SELECT * FROM outreach_contact_history');
    for (const h of history) {
      if (h.id?.startsWith('hist_OP0001_')) {
        await database.run('UPDATE outreach_contact_history SET packId = ? WHERE id = ?', ['OR0001', h.id]);
      } else if (h.id?.startsWith('hist_OP0002_')) {
        await database.run('UPDATE outreach_contact_history SET packId = ? WHERE id = ?', ['OR0002', h.id]);
      } else if (h.id?.startsWith('hist_OP0003_')) {
        await database.run('UPDATE outreach_contact_history SET packId = ? WHERE id = ?', ['GM0001', h.id]);
      } else if (h.id?.startsWith('hist_GM0001_')) {
        await database.run('UPDATE outreach_contact_history SET packId = ? WHERE id = ?', ['GM0002', h.id]);
      } else if (h.id?.startsWith('hist_OR0001_')) {
        await database.run('UPDATE outreach_contact_history SET packId = ? WHERE id = ?', ['OR0003', h.id]);
      } else if (h.packId && (h.packId.startsWith('OP') || h.packId.startsWith('TEMP_'))) {
        await database.run('DELETE FROM outreach_contact_history WHERE id = ?', [h.id]);
      }
    }
  } catch (err) {
    }
  } catch (err) {
    console.error('Error repairing and migrating pack IDs:', err);
  }
}

// Migrate existing sent email records from outreach_packs to sent_email_history
export async function migrateExistingSentHistory(database) {
  try {
    const packs = await database.all('SELECT * FROM outreach_packs');
    for (const pack of packs) {
      let prospects = [];
      try {
        prospects = JSON.parse(pack.prospects);
      } catch (e) {
        continue;
      }
      for (const p of prospects) {
        if (p.sendStatus === 'Sent' || (p.sendHistory && p.sendHistory.some(sh => sh.status === 'Sent'))) {
          const sentEntries = (p.sendHistory && Array.isArray(p.sendHistory))
            ? p.sendHistory.filter(sh => sh.status === 'Sent')
            : [{ email: p.contactEmail || (p.allFoundEmails?.[0]), sentAt: p.sentAt || pack.sentAt || pack.createdAt }];

          for (const se of sentEntries) {
            if (!se.email) continue;
            const sentAt = se.sentAt || p.sentAt || pack.sentAt || pack.createdAt;
            const logId = `hist_${pack.packId || pack.id}_${p.domain}_${se.email.replace(/[^a-z0-9]/gi, '_')}`;
            const existing = await database.get('SELECT id FROM sent_email_history WHERE id = ?', [logId]);
            if (!existing) {
              await database.run(
                `INSERT INTO sent_email_history (id, sentAt, domain, email, templateId, templateName, prospectId, packId, subject, body, workspace)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  logId,
                  sentAt,
                  p.domain || 'unknown',
                  se.email,
                  pack.templateId || pack.packId || null,
                  pack.name || pack.templateName || (pack.packId ? `Pack ${pack.packId}` : 'Outreach Email'),
                  p.id || null,
                  pack.packId || null,
                  pack.templateSubject || null,
                  pack.templateBody || null,
                  pack.workspace || 'tse'
                ]
              );
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error migrating existing sent history:', err);
  }
}



