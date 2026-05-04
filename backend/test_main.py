import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_search_properties_success():
    response = client.post("/api/search", json={
        "zipCode": "400001",
        "radius": 10.0,
        "minBudget": 10000000,
        "maxBudget": 50000000,
        "minSqft": 1000,
        "maxSqft": 3000,
        "minBedrooms": 2,
        "maxBedrooms": 4
    })
    assert response.status_code == 200
    data = response.json()
    assert "properties" in data
    assert "crawledWebsites" in data
    
    properties = data["properties"]
    # Should include prop_1 and prop_3 based on mock data
    assert len(properties) >= 1
    # Check if crawled sites is returned
    assert len(data["crawledWebsites"]) > 0

def test_chat_interaction():
    response = client.post("/api/chat", json={
        "messages": [
            {"role": "user", "content": "sort by price"}
        ]
    })
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "agent"
    assert "sorting controls" in data["content"]
