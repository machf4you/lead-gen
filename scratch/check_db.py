import paramiko
import sys
sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('77.245.157.66', port=22667, username='root', key_filename=r'C:\Users\Admin\.ssh\id_clean_ed25519')

cmd = """python3 -c "
import sqlite3, json

db_path = '/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/database.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute('SELECT id, searchId, searchType, businessType, location, dateTime, count FROM saved_searches LIMIT 10')
rows = cur.fetchall()
print('SAVED SEARCHES IN DB:')
for r in rows:
    print(r)
" """

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8'))
ssh.close()
