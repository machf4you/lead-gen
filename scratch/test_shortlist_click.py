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
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  page.on('response', async resp => {
    if (resp.url().includes('/api/outreach')) {
      console.log('OUTREACH API RESP:', resp.status(), resp.url());
      try {
        const text = await resp.text();
        console.log('RESP BODY:', text.slice(0, 300));
      } catch(e){}
    }
  });

  console.log('Navigating to http://localhost:5000/saved-searches...');
  await page.goto('http://localhost:5000/saved-searches', { waitUntil: 'networkidle2' });

  // Open workspace for SR0007 / Cheltenham
  const rows = await page.$$('tr');
  for (const r of rows) {
    const txt = await page.evaluate(el => el.textContent, r);
    if (txt.includes('SR0007')) {
      console.log('Found SR0007 row. Clicking Open Workspace...');
      const btn = await r.$('button');
      if (btn) await btn.click();
      await new Promise(res => setTimeout(res, 1000));
      break;
    }
  }

  // Check tab count before
  const tabBefore = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const sl = btns.find(b => b.textContent.includes('Shortlist'));
    return sl ? sl.textContent.trim() : 'No tab';
  });
  console.log('Shortlist Tab BEFORE:', tabBefore);

  // Find + Shortlist button in Results table
  console.log('Clicking + Shortlist button on first result...');
  const resultBtns = await page.$$('button');
  let clicked = false;
  for (const b of resultBtns) {
    const txt = await page.evaluate(el => el.textContent.trim(), b);
    if (txt === '+ Shortlist') {
      console.log('Clicking button "+ Shortlist"...');
      await b.click();
      clicked = true;
      await new Promise(res => setTimeout(res, 1500));
      break;
    }
  }
  console.log('Clicked button:', clicked);

  // Check tab count after
  const tabAfter = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const sl = btns.find(b => b.textContent.includes('Shortlist'));
    return sl ? sl.textContent.trim() : 'No tab';
  });
  console.log('Shortlist Tab AFTER:', tabAfter);

  await browser.close();
})();
"""

ssh.exec_command("cat << 'EOF' > /tmp/test_shortlist_click.js\n" + node_script + "\nEOF")
cmd = "node /tmp/test_shortlist_click.js"

stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', 'ignore')
err = stderr.read().decode('utf-8', 'ignore')

print("STDOUT:\n", out)
print("STDERR:\n", err)

ssh.close()
