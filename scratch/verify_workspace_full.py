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
  
  page.on('console', msg => console.log('LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));

  console.log('--- 1. Navigating to http://localhost:5000/saved-searches ---');
  await page.goto('http://localhost:5000/saved-searches', { waitUntil: 'networkidle2' });

  // Set currentUser workspace to smoking_chili if needed or click workspace
  await page.evaluate(() => {
    localStorage.setItem('tse_user', JSON.stringify({ username: 'mac', workspace: 'smoking_chili', workspaceLabel: 'Smoking Chili Media' }));
  });
  await page.reload({ waitUntil: 'networkidle2' });


  // 1. Sidebar height & scroll check
  const sidebarInfo = await page.evaluate(() => {
    const sb = document.querySelector('.sidebar');
    const menu = document.querySelector('.sidebar-menu');
    return {
      sidebarScrollHeight: sb ? sb.scrollHeight : 0,
      sidebarClientHeight: sb ? sb.clientHeight : 0,
      menuScrollHeight: menu ? menu.scrollHeight : 0,
      itemsVisible: Array.from(document.querySelectorAll('.sidebar-item')).map(e => e.textContent.trim())
    };
  });
  console.log('Sidebar Info:', sidebarInfo);

  // 2. Locate row for SR0007 / bathroom showrooms / Kent
  console.log('--- 2. Finding row for SR0007 (bathroom showrooms / Kent) ---');
  const rows = await page.$$('tr');
  // Print all saved search rows
  const allRows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('tr')).map(r => r.textContent.trim().replace(/\s+/g, ' '));
  });
  console.log('All Rows Found:', allRows);

  let targetBtn = null;
  for (const row of rows) {
    const txt = await page.evaluate(el => el.textContent, row);
    if (txt.includes('SR0007')) {
      console.log('Found SR0007 row:', txt.trim());
      targetBtn = await row.$('button');
      break;
    }
  }



  if (targetBtn) {
    console.log('Clicking "Open Workspace" on SR0007...');
    await targetBtn.click();
    await new Promise(r => setTimeout(r, 1000));
  } else {
    console.log('WARNING: SR0007 bathroom showrooms row not found in first page of table!');
  }

  // 3. Verify workspace title & tabs
  const workspaceHeader = await page.evaluate(() => {
    const h2 = document.querySelector('h2');
    return h2 ? h2.textContent.trim() : 'No H2';
  });
  console.log('--- 3. Workspace Header ---:', workspaceHeader);

  const tabsText = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map(b => b.textContent.trim()).filter(t => t.includes('Results') || t.includes('Shortlist') || t.includes('Outreach Packs'));
  });
  console.log('--- 4. Workspace Tabs Visible ---:', tabsText);

  // 4. Click Shortlist tab
  console.log('--- 5. Clicking Shortlist tab ---');
  const tabBtns = await page.$$('button');
  for (const b of tabBtns) {
    const t = await page.evaluate(el => el.textContent.trim(), b);
    if (t.startsWith('Shortlist')) {
      await b.click();
      await new Promise(r => setTimeout(r, 500));
      break;
    }
  }
  const shortlistContent = await page.evaluate(() => document.body.textContent.includes('Shortlist') ? 'Shortlist view active' : 'No shortlist view');
  console.log('Shortlist view:', shortlistContent);

  // 5. Click Outreach Packs tab
  console.log('--- 6. Clicking Outreach Packs tab ---');
  for (const b of tabBtns) {
    const t = await page.evaluate(el => el.textContent.trim(), b);
    if (t.startsWith('Outreach Packs')) {
      await b.click();
      await new Promise(r => setTimeout(r, 500));
      break;
    }
  }
  const packsContent = await page.evaluate(() => document.body.textContent.includes('Outreach Packs') ? 'Packs view active' : 'No packs view');
  console.log('Outreach Packs view:', packsContent);

  await browser.close();
})();
"""

ssh.exec_command("cat << 'EOF' > /tmp/verify_workspace_full.js\n" + node_script + "\nEOF")

cmd = "node /tmp/verify_workspace_full.js"

stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', 'ignore')
err = stderr.read().decode('utf-8', 'ignore')

print("STDOUT:\n", out)
print("STDERR:\n", err)

ssh.close()
