import paramiko
import sys
sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('77.245.157.66', port=22667, username='root', key_filename=r'C:\Users\Admin\.ssh\id_clean_ed25519')

cmd = """python3 -c "
with open('/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/client/dist/assets/index-CsmDzpTq.js', 'r') as f:
    code = f.read()

# find position of ko
import re
print('Length of JS bundle:', len(code))

# search for function definition or variable 'Ar' in the bundle
# Let's search around line 66 or offset
lines = code.split('\\n')
print('Number of lines:', len(lines))
line66 = lines[65] if len(lines) >= 66 else lines[-1]
print('Line 66 length:', len(line66))
print('Snippet around col 2768:', line66[max(0, 2768-200):min(len(line66), 2768+200)])
" """

stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', 'ignore')
err = stderr.read().decode('utf-8', 'ignore')

print("STDOUT:\n", out)
print("STDERR:\n", err)

ssh.close()
