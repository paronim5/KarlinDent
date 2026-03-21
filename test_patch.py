import urllib.request
import json

url = "http://localhost:5000/api/schedule/6/status"
data = json.dumps({"status": "accepted"}).encode('utf-8')
req = urllib.request.Request(url, data=data, method='PATCH')
req.add_header('Content-Type', 'application/json')
req.add_header('X-Staff-Id', '13')
req.add_header('X-Staff-Role', 'admin')

try:
    with urllib.request.urlopen(req) as response:
        print(f"Status: {response.status}")
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
