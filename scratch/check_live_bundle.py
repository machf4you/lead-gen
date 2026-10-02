import urllib.request
import re
import ssl
ssl._create_default_https_context = ssl._create_unverified_context


url = 'https://lead-gen.thesearchequation.co.uk/outreach-shortlist?_v=1790773316921'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8')
        print('FULL HTML:\n', html)

        for js in js_files:
            js_url = 'https://lead-gen.thesearchequation.co.uk' + js if js.startswith('/') else js
            print('Fetching JS:', js_url)
            with urllib.request.urlopen(js_url) as js_resp:
                js_content = js_resp.read().decode('utf-8')
                print('JS size:', len(js_content))
                # Search for version or commit string
                ver_match = re.findall(r'commit:[^,}]*', js_content[:2000])
                print('Version matches:', ver_match[:5])
except Exception as e:
    print('Error:', e)
