import pytest
from fastapi.testclient import TestClient
from main import app
import os

client = TestClient(app)

def test_search_mock_data():
    """Test the /api/search endpoint with the mock data source."""
    payload = {
        "zipCode": "560076",
        "radius": 10.0,
        "dataSource": "mock"
    }
    
    response = client.post("/api/search", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify structure
    assert "properties" in data
    assert "crawledWebsites" in data
    
    # Verify it returned mock properties
    assert len(data["properties"]) > 0
    first_prop = data["properties"][0]
    
    # Verify the fallback distance calculation worked (since no maps API key in test env)
    assert first_prop["distance"] <= 10.0
    assert first_prop["zipCode"] == "560076"
    assert first_prop["currency"] == "INR"

def test_search_deterministic_without_key():
    """Test that the deterministic engine correctly fails if no API key is present."""
    # Temporarily remove API key if it exists
    original_key = os.getenv("APIFY_API_KEY")
    if original_key:
        del os.environ["APIFY_API_KEY"]
        
    payload = {
        "zipCode": "10001",
        "radius": 5.0,
        "dataSource": "deterministic"
    }
    
    response = client.post("/api/search", json=payload)
    
    assert response.status_code == 400
    assert "APIFY_API_KEY is not configured" in response.json()["detail"]
    
    # Restore key
    if original_key:
        os.environ["APIFY_API_KEY"] = original_key

def test_chat_summary_fallback():
    """Test the /api/chat endpoint fallback when Gemini key is not present."""
    # Temporarily remove API key to test fallback
    original_key = os.getenv("GEMINI_API_KEY")
    if original_key:
        del os.environ["GEMINI_API_KEY"]
        
    payload = {
        "messages": [
            {"role": "user", "content": "Please summarize this property."}
        ],
        "context": '{"intent": "summarize_property"}'
    }
    
    response = client.post("/api/chat", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "agent"
    assert "GEMINI_API_KEY is not set" in data["content"]
    
    # Restore key
    if original_key:
        os.environ["GEMINI_API_KEY"] = original_key
