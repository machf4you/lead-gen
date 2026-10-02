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

  console.log('Navigating to http://localhost:5000/saved-searches...');
  await page.goto('http://localhost:5000/saved-searches', { waitUntil: 'networkidle2' });

  console.log('Finding Open Workspace button...');
  const buttons = await page.$$('button');
  console.log('Total buttons found:', buttons.length);

  // Print button texts
  for (let i = 0; i < buttons.length; i++) {
    const txt = await page.evaluate(el => el.textContent.trim(), buttons[i]);
    if (txt.includes('Open Workspace')) {
      console.log(`Clicking button ${i}: "${txt}"...`);
      await buttons[i].click();
      await new Promise(r => setTimeout(r, 1000));
      break;
    }
  }

  const h2Text = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1, h2, h3, button, div')).map(e => e.textContent.trim()).filter(t => t.includes('Workspace') || t.includes('Results') || t.includes('Shortlist') || t.includes('Packs'));
  });
  console.log('DOM TEXT AFTER CLICK:', h2Text.slice(0, 15));

  await browser.close();
})();
"""

# Write script to remote file first
ssh.exec_command("cat << 'EOF' > /tmp/test_click_workspace.js\n" + node_script + "\nEOF")

cmd = "node /tmp/test_click_workspace.js"

stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', 'ignore')
err = stderr.read().decode('utf-8', 'ignore')

print("STDOUT:\n", out)
print("STDERR:\n", err)

ssh.close()
