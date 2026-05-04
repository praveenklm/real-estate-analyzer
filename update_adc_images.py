import sys
import json
import subprocess

if len(sys.argv) != 2:
    print("Usage: python3 update_adc_images.py <SHORT_SHA>")
    sys.exit(1)

short_sha = sys.argv[1]

# 1. Fetch current template
print("Fetching current application template...")
result = subprocess.run([
    "gcloud", "alpha", "design-center", "spaces", "application-templates", "describe",
    "real-estate-agent-re2024",
    "--space=default-space",
    "--project=ide-flow",
    "--location=us-central1",
    "--format=json"
], capture_output=True, text=True, check=True)

data = json.loads(result.stdout)
components = data.get("applicationTemplate", {}).get("components", [])

update_payload = []

for comp in components:
    uri = comp.get("uri", "")
    comp_name = uri.split("/")[-1]
    
    if comp_name in ["backend-re2024", "frontend-re2024"]:
        # Find containers parameter
        params = comp.get("parameters", [])
        for p in params:
            if p.get("key") == "containers":
                containers_val = p.get("value", [])
                
                # Update image tag
                for c in containers_val:
                    img = c.get("container_image", "")
                    if img:
                        base = img.split(":")[0]
                        c["container_image"] = f"{base}:{short_sha}"
                
                update_payload.append({
                    "componentUri": uri,
                    "parameters": [{
                        "key": "containers",
                        "value": containers_val
                    }]
                })

if not update_payload:
    print("No containers found to update.")
    sys.exit(1)

# 2. Update template
payload_json = json.dumps(update_payload)
print(f"Updating template with payload: {payload_json}")

with open("update_payload.json", "w") as f:
    f.write(payload_json)

subprocess.run([
    "gcloud", "alpha", "design-center", "spaces", "application-templates", "update",
    "real-estate-agent-re2024",
    "--space=default-space",
    "--project=ide-flow",
    "--location=us-central1",
    "--update-component-parameters=update_payload.json"
], check=True)

print("Template updated successfully!")
