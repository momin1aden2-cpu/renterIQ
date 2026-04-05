import json
import urllib.request

print("Fetching Australian suburbs data...")
url = "https://raw.githubusercontent.com/schappim/australian-postcodes/master/australian-postcodes.json"

with urllib.request.urlopen(url) as response:
    data = json.loads(response.read().decode())

print(f"Total entries: {len(data)}")

# Transform to our format
suburbs = []
for item in data[1:]:  # Skip header row
    suburbs.append({
        "name": item.get("suburb", ""),
        "state": item.get("state", ""),
        "postcode": item.get("postcode", "")
    })

# Remove duplicates and empty entries
seen = set()
unique_suburbs = []
for s in suburbs:
    key = f"{s['name']}|{s['state']}|{s['postcode']}"
    if key not in seen and s['name'] and s['state'] and s['postcode']:
        seen.add(key)
        unique_suburbs.append(s)

output = {"suburbs": unique_suburbs}

with open("public/data/suburbs.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"Saved {len(unique_suburbs)} unique suburbs to public/data/suburbs.json")
