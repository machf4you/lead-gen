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

  console.log('--- Navigating to Home page http://localhost:5000/ ---');
  await page.goto('http://localhost:5000/', { waitUntil: 'networkidle2' });

  // 1. Check title & form container
  const headerTitle = await page.evaluate(() => {
    const el = document.querySelector('.header-title');
    return el ? el.textContent.trim() : null;
  });
  console.log('Header Title:', headerTitle);

  // 2. Check table headers underneath
  const ths = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table.results-table th')).map(th => th.textContent.trim());
  });
  console.log('Table Headers Found:', ths);

  // 3. Count rows found
  const rows = await page.evaluate(() => {
    const tbody = document.querySelector('table.results-table tbody');
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr')).map(r => r.textContent.trim().replace(/\\s+/g, ' '));
  });
  console.log('Number of Saved Searches Rows:', rows.length);
  console.log('First Row Sample:', rows[0]);

  await browser.close();
})();
"""

ssh.exec_command("cat << 'EOF' > /tmp/verify_home_saved.js\n" + node_script + "\nEOF")

stdin, stdout, stderr = ssh.exec_command("node /tmp/verify_home_saved.js")
out = stdout.read().decode('utf-8', 'ignore')
err = stderr.read().decode('utf-8', 'ignore')

print("STDOUT:\n", out)
print("STDERR:\n", err)

ssh.close()
