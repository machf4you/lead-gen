import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('77.245.157.66', port=22667, username='root', key_filename=r'C:\Users\Admin\.ssh\id_clean_ed25519')

bash_script = """
set -e
cd /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/repo
git pull origin main
COMMIT_HASH=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +%Y%m%d%H%M%S)
RELEASE_DIR="/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/releases/${COMMIT_HASH}_${TIMESTAMP}"

echo "Creating release directory ${RELEASE_DIR}..."
mkdir -p "${RELEASE_DIR}"
cp -r /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/repo/. "${RELEASE_DIR}/"

if [ -d "/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/client/node_modules" ]; then
  cp -r /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/client/node_modules "${RELEASE_DIR}/client/"
fi

if [ -d "/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/server/node_modules" ]; then
  cp -r /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/server/node_modules "${RELEASE_DIR}/server/"
fi

if [ -f "/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/.env" ]; then
  cp /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/.env "${RELEASE_DIR}/server/.env"
fi

if [ -f "/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/database.db" ]; then
  ln -sfn /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/database.db "${RELEASE_DIR}/server/database.db"
fi

cd "${RELEASE_DIR}/client"
npm run build

ln -sfn "${RELEASE_DIR}" /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current
pm2 restart lead-gen-api
echo "DEPLOYMENT COMPLETE TO ${RELEASE_DIR}"
"""

stdin, stdout, stderr = ssh.exec_command(f"bash -c '{bash_script}'")
out = stdout.read().decode('utf-8', 'ignore')
err = stderr.read().decode('utf-8', 'ignore')

print("STDOUT:\n", out)
print("STDERR:\n", err)

ssh.close()
