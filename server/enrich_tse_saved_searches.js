import { getDb } from './db.js';
import { crawlProspectContactEmails, normalizeDomain } from './server.js';

async function enrichTseSavedSearches() {
  console.log("=== STARTING RETROSPECTIVE EMAIL ENRICHMENT FOR TSE SAVED SEARCHES ===");
  const db = await getDb();

  // Fetch only TSE saved searches (explicitly preserving any other workspace data)
  const rows = await db.all("SELECT id, searchId, searchType, businessType, location, workspace, data FROM saved_searches WHERE workspace = 'tse'");
  console.log(`Found ${rows.length} TSE Saved Searches to process.`);

  let totalProspectsProcessed = 0;
  let totalEmailsDiscovered = 0;
  let totalNoEmails = 0;

  for (const row of rows) {
    console.log(`\n--- Processing Search: ${row.searchId} (${row.businessType} - ${row.location}) [${row.searchType}] ---`);
    let items = [];
    try {
      items = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    } catch (e) {
      console.error(`Error parsing data for search ${row.searchId}:`, e.message);
      continue;
    }

    if (!Array.isArray(items) || items.length === 0) {
      console.log("No items in search, skipping.");
      continue;
    }

    console.log(`Total prospects in search: ${items.length}`);

    // Concurrency worker pool for fast, reliable crawling
    const CONCURRENCY = 5;
    let nextIndex = 0;
    let searchEmailsFound = 0;
    let searchNoEmails = 0;

    const worker = async () => {
      while (nextIndex < items.length) {
        const idx = nextIndex++;
        const item = items[idx];
        const isOrganic = !item.name;
        const target = isOrganic ? item.url : (item.website || '');
        const domain = isOrganic ? item.domain : (item.website ? normalizeDomain(item.website) : (item.domain || ''));
        const cleanTarget = target || (domain ? `https://${domain}` : '');

        if (!cleanTarget) {
          item.contactEmail = null;
          item.allFoundEmails = [];
          item.emailStatus = 'No Email';
          searchNoEmails++;
          continue;
        }

        // If already has verified contact email from prior analysis, keep it and ensure status is Email Found
        if (item.contactEmail || (item.analysis && item.analysis.contactEmail)) {
          const email = item.contactEmail || item.analysis.contactEmail;
          item.contactEmail = email;
          item.allFoundEmails = item.allFoundEmails || (item.analysis && item.analysis.allFoundEmails) || [email];
          item.emailStatus = 'Email Found';
          if (item.analysis) {
            item.analysis.contactEmail = email;
            item.analysis.allFoundEmails = item.allFoundEmails;
            item.analysis.emailStatus = 'Email Found';
          }
          searchEmailsFound++;
          continue;
        }

        try {
          const result = await crawlProspectContactEmails(cleanTarget);
          const hasEmail = Boolean(result.contactEmail);
          const status = hasEmail ? 'Email Found' : 'No Email';

          item.contactEmail = result.contactEmail || null;
          item.allFoundEmails = result.allFoundEmails || (result.contactEmail ? [result.contactEmail] : []);
          item.emailStatus = status;
          item.emailSource = result.emailSource || cleanTarget;

          if (item.analysis) {
            item.analysis.contactEmail = item.contactEmail;
            item.analysis.allFoundEmails = item.allFoundEmails;
            item.analysis.emailStatus = status;
            item.analysis.emailSource = item.emailSource;
          }

          if (hasEmail) {
            searchEmailsFound++;
            console.log(`  [✓ Found] #${item.rank || (idx + 1)} ${domain || cleanTarget} -> ${result.contactEmail}`);
          } else {
            searchNoEmails++;
            console.log(`  [✕ No Email] #${item.rank || (idx + 1)} ${domain || cleanTarget}`);
          }
        } catch (err) {
          item.contactEmail = null;
          item.allFoundEmails = [];
          item.emailStatus = 'No Email';
          searchNoEmails++;
          console.log(`  [✕ Error/No Email] #${item.rank || (idx + 1)} ${domain || cleanTarget}: ${err.message}`);
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker());
    await Promise.all(workers);

    // Update database row
    await db.run("UPDATE saved_searches SET data = ? WHERE id = ? AND workspace = 'tse'", [JSON.stringify(items), row.id]);
    console.log(`✓ Search ${row.searchId} updated: ${searchEmailsFound} verified emails, ${searchNoEmails} no email.`);

    totalProspectsProcessed += items.length;
    totalEmailsDiscovered += searchEmailsFound;
    totalNoEmails += searchNoEmails;
  }

  console.log("\n=== RETROSPECTIVE ENRICHMENT COMPLETE ===");
  console.log(`Total Prospects Processed: ${totalProspectsProcessed}`);
  console.log(`Verified Emails Found (✓): ${totalEmailsDiscovered}`);
  console.log(`No Email Found (✕): ${totalNoEmails}`);
}

enrichTseSavedSearches().catch(err => {
  console.error("Fatal error during retrospective enrichment:", err);
  process.exit(1);
});
