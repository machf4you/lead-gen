import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('77.245.157.66', port=22667, username='root', key_filename=r'C:\Users\Admin\.ssh\id_clean_ed25519')

node_script = """
const puppeteer = require('/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/server/node_modules/puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('--- 1. Navigating to http://localhost:5000/saved-searches?searchId=SR0018 ---');
  await page.goto('http://localhost:5000/saved-searches?searchId=SR0018', { waitUntil: 'domcontentloaded' });

  // Wait for data fetch
  await new Promise(r => setTimeout(r, 2000));

  // 1. Locate the Results and Selected tabs inside results view
  const tabTexts = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map(b => b.textContent.trim()).filter(t => t.startsWith('Results (') || t.startsWith('Selected ('));
  });
  console.log('Tabs Found on Results View:', tabTexts);

  // 2. Count table rows in Results view
  const resultsRowCount = await page.evaluate(() => {
    const rows = document.querySelectorAll('table.results-table tbody tr');
    return rows.length;
  });
  console.log('Results Tab Rows Count:', resultsRowCount);

  // 3. Click Selected tab
  console.log('--- 2. Clicking Selected tab ---');
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const txt = await page.evaluate(el => el.textContent.trim(), b);
    if (txt.startsWith('Selected (')) {
      await b.click();
      await new Promise(r => setTimeout(r, 500));
      break;
    }
  }

  const selectedRowCount = await page.evaluate(() => {
    const rows = document.querySelectorAll('table.results-table tbody tr');
    return rows.length;
  });
  console.log('Selected Tab Rows Count:', selectedRowCount);

  // 4. Click Results tab to switch back
  console.log('--- 3. Clicking Results tab to switch back ---');
  const buttons2 = await page.$$('button');
  for (const b of buttons2) {
    const txt = await page.evaluate(el => el.textContent.trim(), b);
    if (txt.startsWith('Results (')) {
      await b.click();
      await new Promise(r => setTimeout(r, 500));
      break;
    }
  }

  const restoredRowCount = await page.evaluate(() => {
    const rows = document.querySelectorAll('table.results-table tbody tr');
    return rows.length;
  });
  console.log('Restored Results Tab Rows Count:', restoredRowCount);

  await browser.close();
})();
"""

ssh.exec_command("cat << 'EOF' > /tmp/verify_tabs.js\n" + node_script + "\nEOF")

stdin, stdout, stderr = ssh.exec_command("node /tmp/verify_tabs.js")
out = stdout.read().decode('utf-8', 'ignore')
err = stderr.read().decode('utf-8', 'ignore')

print("STDOUT:\n", out)
print("STDERR:\n", err)

ssh.close()
