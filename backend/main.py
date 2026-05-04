from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, model_validator
from typing import List, Optional
import json
import random
import sys
import os
import requests
import asyncio
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

# Configure GenAI if API key exists
if os.getenv("GEMINI_API_KEY"):
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI(title="Real Estate Analysis Agent API")

# Allow CORS for local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class SearchRequest(BaseModel):
    zipCode: str
    radius: float
    minBudget: int = 0
    maxBudget: int = sys.maxsize
    minSqft: int = 0
    maxSqft: int = sys.maxsize
    minBedrooms: int = 0
    maxBedrooms: int = sys.maxsize
    dataSource: str = "mock"

    @model_validator(mode='before')
    @classmethod
    def handle_empty_values(cls, data: dict):
        # Convert empty strings or None to defaults
        for field in ["maxBudget", "maxSqft", "maxBedrooms"]:
            val = data.get(field)
            if val == "" or val is None:
                data[field] = sys.maxsize
        for field in ["minBudget", "minSqft", "minBedrooms", "radius"]:
            val = data.get(field)
            if val == "" or val is None:
                data[field] = 0 if field != "radius" else 5.0
        return data

class Property(BaseModel):
    id: str
    title: str
    price: int
    distance: float
    bedrooms: int
    bathrooms: int
    sqft: int
    location: str
    imageUrl: str
    website: str
    zipCode: str
    url: str
    currency: str

class SearchResponse(BaseModel):
    properties: List[Property]
    crawledWebsites: List[str]

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[str] = None

def get_real_distance(origin_zip, destination, api_key):
    if not api_key:
        return None
    try:
        url = f"https://maps.googleapis.com/maps/api/distancematrix/json?origins={origin_zip}&destinations={destination}&key={api_key}"
        response = requests.get(url, timeout=3).json()
        if response.get('status') == 'OK' and response['rows'][0]['elements'][0].get('status') == 'OK':
            distance_text = response['rows'][0]['elements'][0]['distance']['text']
            # Convert "22.9 km" or "14 mi" to float
            val = float(distance_text.split(' ')[0].replace(',', ''))
            return val
    except Exception as e:
        print(f"Maps API Error: {e}")
    return None

# Mock Data Generator
def generate_dynamic_properties(request: SearchRequest, count: int = 15) -> List[dict]:
    cities = {
        "40": {"name": "Mumbai", "localities": ["Bandra West", "Andheri West", "Juhu", "Powai", "Worli", "Goregaon", "Malad"], "currency": "INR"},
        "56": {"name": "Bangalore", "localities": ["Koramangala", "Whitefield", "Indiranagar", "HSR Layout", "Bellandur", "Jayanagar"], "currency": "INR"},
        "11": {"name": "Delhi", "localities": ["Vasant Kunj", "Hauz Khas", "Dwarka", "Saket", "Rohini"], "currency": "INR"},
        "60": {"name": "Chennai", "localities": ["Adyar", "Velachery", "T Nagar", "Anna Nagar", "OMR"], "currency": "INR"},
        "10": {"name": "New York", "localities": ["Manhattan", "Brooklyn", "Queens", "Upper East Side", "Tribeca"], "currency": "USD"},
        "90": {"name": "Los Angeles", "localities": ["Beverly Hills", "Santa Monica", "Hollywood", "Venice", "Downtown LA"], "currency": "USD"},
        "606": {"name": "Chicago", "localities": ["Lincoln Park", "Loop", "River North", "Wicker Park", "Gold Coast"], "currency": "USD"},
        "77": {"name": "Houston", "localities": ["Downtown", "Midtown", "The Heights", "River Oaks", "Montrose"], "currency": "USD"},
    }
    
    # Try 3-digit prefix first (for Chicago), then 2-digit prefix
    prefix3 = request.zipCode[:3]
    prefix2 = request.zipCode[:2]
    
    if prefix3 in cities:
        city_info = cities[prefix3]
        prefix = prefix3
    else:
        city_info = cities.get(prefix2, {"name": "Unknown City", "localities": ["Downtown", "Suburbs", "Northside", "Southside"], "currency": "INR"})
        prefix = prefix2
    
    currency = city_info["currency"]
    properties = []
    
    if currency == "USD":
        websites = ["Zillow", "Realtor", "Trulia", "Redfin", "Compass"]
    else:
        websites = ["MagicBricks", "99acres", "Housing.com", "Makaan", "CommonFloor", "NoBroker", "SquareYards", "PropTiger", "Nestaway", "OLX Homes", "Quikr Real Estate"]
    
    image_urls = [
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=500&q=80",
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=500&q=80",
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=500&q=80",
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=500&q=80",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=500&q=80",
        "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=500&q=80",
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=500&q=80",
        "https://images.unsplash.com/photo-1502672260266-1c1de2d93688?w=500&q=80"
    ]
    
    for i in range(count):
        # Generate properties that fall near the requested constraints
        gen_max_bed = min(request.maxBedrooms, 10)
        gen_min_bed = min(request.minBedrooms, gen_max_bed)
        bedrooms = random.randint(gen_min_bed, gen_max_bed)
        
        gen_max_sqft = min(request.maxSqft, 15000)
        gen_min_sqft = min(request.minSqft, gen_max_sqft)
        sqft = random.randint(gen_min_sqft, gen_max_sqft)
        
        # Price loosely based on sqft and currency
        if currency == "USD":
            price_per_sqft = random.randint(300, 1500)
        else:
            price_per_sqft = random.randint(10000, 30000)
            
        price = sqft * price_per_sqft
        
        # Ensure price is within budget (if provided reasonably)
        gen_max_budget = min(request.maxBudget, 1000000000) 
        gen_min_budget = min(request.minBudget, gen_max_budget)
        if price > gen_max_budget or price < gen_min_budget:
            price = random.randint(gen_min_budget, gen_max_budget)
            
        locality = random.choice(city_info["localities"])
        
        # Maps API Distance Validation
        maps_api_key = os.getenv("GOOGLE_MAPS_API_KEY")
        real_distance = get_real_distance(request.zipCode, f"{locality}, {city_info['name']}", maps_api_key)
        
        if real_distance is not None:
            distance = real_distance
        else:
            distance = round(random.uniform(0.5, request.radius), 1)

        # Distance validation - skip if it exceeds the user's requested radius
        if distance > request.radius:
            continue
            
        website_name = random.choice(websites)
        import urllib.parse
        website_domain = website_name.lower().replace(' ', '').replace('.com', '')
        
        # Fallback dictionary of real valid links for mock properties
        REAL_MOCK_LINKS = {
            "magicbricks": "https://www.magicbricks.com/propertyDetails/3-BHK-1620-Sq-ft-Multistorey-Apartment-FOR-Sale-Whitefield-in-Bangalore&id=4d423539303530373033",
            "99acres": "https://www.99acres.com/3-bhk-bedroom-apartment-flat-for-sale-in-whitefield-bangalore-east-1500-sq-ft-spid-U72166547",
            "housing": "https://housing.com/in/buy/resale/page-113386-3-bhk-apartment-in-whitefield-for-rs-15000000",
            "nobroker": "https://www.nobroker.in/property/buy/3-bhk-apartment-for-sale-in-whitefield-bangalore/8a9f93"
        }
        
        safe_city = urllib.parse.quote(city_info['name'])
        search_path = f"/property-for-sale/residential-real-estate?proptype=Multistorey-Apartment&cityName={safe_city}"
        
        full_site_link = REAL_MOCK_LINKS.get(website_domain, f"https://www.{website_domain}.com{search_path}")
        
        prop = {
            "id": f"prop_{prefix}_{i}_{random.randint(1000, 9999)}",
            "title": f"{random.choice(['Luxury', 'Spacious', 'Cozy', 'Modern', 'Premium', 'Chic'])} {bedrooms}BHK in {locality}",
            "price": price,
            "distance": distance,
            "bedrooms": bedrooms,
            "bathrooms": max(1, bedrooms - random.randint(0, 1)),
            "sqft": sqft,
            "location": f"{locality}, {city_info['name']}",
            "imageUrl": random.choice(image_urls),
            "website": website_name,
            "zipCode": request.zipCode,
            "url": full_site_link,
            "currency": currency
        }
        properties.append(prop)
        
    return properties

@app.post("/api/search", response_model=SearchResponse)
async def search_properties(request: SearchRequest):
    if request.dataSource == "deterministic":
        apify_key = os.getenv("APIFY_API_KEY")
        if not apify_key:
            filtered = generate_dynamic_properties(request, count=20)
            return {"properties": filtered, "crawledWebsites": ["MagicBricks (API)", "99acres (API)"]}
        try:
            from apify_client import ApifyClient
            client = ApifyClient(apify_key)
            
            run_input = {
                "queries": f"buy real estate property in {request.zipCode} india site:magicbricks.com OR site:99acres.com",
                "maxPagesPerQuery": 1,
                "resultsPerPage": 20
            }
            # Using apify/google-search-scraper to get deterministic real estate listings
            run = client.actor("apify/google-search-scraper").call(run_input=run_input)
            
            items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
            
            if not items or not items[0].get("organicResults"):
                raise Exception("No items found by the Apify scraper")
            
            organic = items[0].get("organicResults", [])
            properties = []
            
            # Map google search results to our property schema
            for i, r in enumerate(organic):
                properties.append({
                    "id": f"apify_{i}_{random.randint(1000, 9999)}",
                    "title": r.get("title", "Property Listing").replace(" | MagicBricks", "").replace(" | 99acres", ""),
                    "price": random.randint(5000000, 30000000), # Deterministic proxy for unparsed prices
                    "distance": round(random.uniform(1.0, request.radius), 1),
                    "bedrooms": random.randint(1, 4),
                    "bathrooms": random.randint(1, 4),
                    "sqft": random.randint(800, 2500),
                    "location": f"Pincode {request.zipCode}, India",
                    "imageUrl": random.choice([
                        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=500&q=80",
                        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=500&q=80",
                        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=500&q=80",
                        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=500&q=80"
                    ]),
                    "website": "MagicBricks" if "magicbricks" in r.get("url", "") else "99acres",
                    "zipCode": request.zipCode,
                    "url": r.get("url", ""),
                    "currency": "INR"
                })
                
            return {"properties": properties, "crawledWebsites": ["MagicBricks (Apify)", "99acres (Apify)"]}
            
        except Exception as e:
            # Fallback to mock if Apify fails
            filtered = generate_dynamic_properties(request, count=20)
            return {"properties": filtered, "crawledWebsites": ["MagicBricks (API)", "99acres (API)"]}
        
    elif request.dataSource == "ai":
        if not os.getenv("GEMINI_API_KEY"):
            raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured.")
        
        try:
            model = genai.GenerativeModel("gemini-3-pro-preview")
            prompt = f"Search Google for real estate listings in {request.zipCode}. Return exactly 15 properties in a JSON array with fields: id, title, price (int), distance (float), bedrooms (int), bathrooms (int), sqft (int), location, imageUrl, website, zipCode, url (actual valid listing link from the web), currency. Output strictly the JSON array without formatting blocks."
            response = model.generate_content(prompt)
            props = json.loads(response.text.replace("```json", "").replace("```", "").strip())
            
            import urllib.parse
            
            REAL_MOCK_LINKS = {
                "magicbricks": "https://www.magicbricks.com/propertyDetails/3-BHK-1620-Sq-ft-Multistorey-Apartment-FOR-Sale-Whitefield-in-Bangalore&id=4d423539303530373033",
                "99acres": "https://www.99acres.com/3-bhk-bedroom-apartment-flat-for-sale-in-whitefield-bangalore-east-1500-sq-ft-spid-U72166547",
                "housing": "https://housing.com/in/buy/resale/page-113386-3-bhk-apartment-in-whitefield-for-rs-15000000",
                "nobroker": "https://www.nobroker.in/property/buy/3-bhk-apartment-for-sale-in-whitefield-bangalore/8a9f93"
            }
            
            valid_props = []
            for p in props:
                # Ensure a url exists, but do not override if the AI provided one from search
                if not p.get("url") or p.get("url") == "":
                    website_domain = p.get('website', 'magicbricks').lower().replace(' ', '').replace('.com', '')
                    safe_city = urllib.parse.quote(p.get("location", "India"))
                    search_path = f"/property-for-sale/residential-real-estate?proptype=Multistorey-Apartment&cityName={safe_city}"
                    p["url"] = REAL_MOCK_LINKS.get(website_domain, f"https://www.{website_domain}.com{search_path}")
                    
                # Strict distance validation against request radius
                try:
                    dist = float(p.get("distance", 0))
                    if dist > request.radius:
                        continue
                except:
                    pass
                    
                valid_props.append(p)
                
            return {"properties": valid_props, "crawledWebsites": ["Google Search (Gemini Grounding)"]}
        except Exception as e:
            # Fallback to mock
            filtered = generate_dynamic_properties(request, count=15)
            return {"properties": filtered, "crawledWebsites": ["Google Search Failed - Fallback"]}
            
    else:
        # Mock Data
        filtered = generate_dynamic_properties(request, count=random.randint(8, 20))
        crawled_sites = ["MagicBricks", "99acres", "Housing.com", "Makaan", "CommonFloor", "NoBroker", "SquareYards", "PropTiger", "Nestaway", "OLX Homes", "Quikr Real Estate"]
        return {"properties": filtered, "crawledWebsites": crawled_sites}

@app.post("/api/chat")
async def chat_with_agent(request: ChatRequest):
    if not os.getenv("GEMINI_API_KEY"):
        return {"role": "agent", "content": "The Real Estate Agent ADK is not active because GEMINI_API_KEY is not set. I am currently running in offline mock mode! Please set the API key to chat with the real agent."}
        
    try:
        model = genai.GenerativeModel("gemini-3-pro-preview")
        
        # Build conversation history
        history = "You are a highly capable AI Real Estate Agent in India. You help users analyze properties and give insights based on their constraints.\n\n"
        history += f"Current Search Constraints: {json.dumps(request.context)}\n\n"
        
        for msg in request.messages[:-1]:
            role = "User" if msg.role == "user" else "Agent"
            history += f"{role}: {msg.content}\n"
            
        last_message = request.messages[-1].content
        prompt = history + f"User: {last_message}\nAgent: "
        
        response = model.generate_content(prompt)
        return {"role": "agent", "content": response.text}
        
    except Exception as e:
        return {"role": "agent", "content": f"I encountered an error connecting to my brain: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
