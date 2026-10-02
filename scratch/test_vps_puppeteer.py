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
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER PAGEERROR:', err.message, err.stack));
  page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure().errorText));

  // Set session cookie or bypass login if needed, or navigate directly
  console.log('Navigating to http://localhost:5000/outreach-shortlist...');
  await page.goto('http://localhost:5000/outreach-shortlist', { waitUntil: 'networkidle2' });

  const content = await page.content();
  console.log('PAGE CONTENT LENGTH:', content.length);
  const title = await page.title();
  console.log('PAGE TITLE:', title);

  const h2Text = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3, div')).map(e => e.textContent.trim()).filter(t => t.includes('Outreach') || t.includes('Shortlist') || t.includes('Saved Search'));
  });
  console.log('DOM HEADINGS & TEXT FOUND:', h2Text.slice(0, 10));


  await browser.close();
})();
"""

# Write script to remote file first
ssh.exec_command("cat << 'EOF' > /tmp/test_puppeteer.js\n" + node_script + "\nEOF")

cmd = "node /tmp/test_puppeteer.js"

stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', 'ignore')
err = stderr.read().decode('utf-8', 'ignore')

print("STDOUT:\n", out)
print("STDERR:\n", err)

ssh.close()

