"""Tests for Chat Threads API endpoints."""

import pytest


class TestThreadsAPI:
    """Test /api/threads endpoints."""

    async def test_list_threads_empty(self, client):
        response = await client.get("/api/threads")

        assert response.status_code == 200
        assert response.json() == []

    async def test_create_thread(self, client):
        response = await client.post("/api/threads", json={"title": "Test Thread"})

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["title"] == "Test Thread"
        assert "created_at" in data

    async def test_create_thread_no_title(self, client):
        response = await client.post("/api/threads", json={})

        assert response.status_code == 200
        data = response.json()
        assert "id" in data

    async def test_get_thread(self, client):
        create_response = await client.post("/api/threads", json={"title": "My Thread"})
        thread_id = create_response.json()["id"]

        response = await client.get(f"/api/threads/{thread_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == thread_id
        assert data["title"] == "My Thread"
        assert data["message_count"] == 0

    async def test_get_thread_not_found(self, client):
        response = await client.get("/api/threads/nonexistent")

        assert response.status_code == 200
        assert response.json()["error"] == "Thread not found"

    async def test_get_thread_messages_empty(self, client):
        create_response = await client.post("/api/threads", json={"title": "Empty Thread"})
        thread_id = create_response.json()["id"]

        response = await client.get(f"/api/threads/{thread_id}/messages")

        assert response.status_code == 200
        data = response.json()
        assert data["thread_id"] == thread_id
        assert data["messages"] == []
        assert data["count"] == 0

    async def test_delete_thread(self, client):
        create_response = await client.post("/api/threads", json={"title": "To Delete"})
        thread_id = create_response.json()["id"]

        response = await client.delete(f"/api/threads/{thread_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

        get_response = await client.get(f"/api/threads/{thread_id}")
        assert get_response.json()["error"] == "Thread not found"

    async def test_delete_thread_not_found(self, client):
        response = await client.delete("/api/threads/nonexistent")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False

    async def test_delete_all_threads(self, client):
        await client.post("/api/threads", json={"title": "Thread 1"})
        await client.post("/api/threads", json={"title": "Thread 2"})

        response = await client.delete("/api/threads")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["deleted"] == 2

        list_response = await client.get("/api/threads")
        assert list_response.json() == []

    async def test_list_threads_with_limit(self, client):
        for i in range(5):
            await client.post("/api/threads", json={"title": f"Thread {i}"})

        response = await client.get("/api/threads?limit=3")

        assert response.status_code == 200
        assert len(response.json()) == 3

    async def test_thread_messages_pagination(self, client):
        create_response = await client.post("/api/threads", json={"title": "Paginated"})
        thread_id = create_response.json()["id"]

        response = await client.get(f"/api/threads/{thread_id}/messages?limit=5")

        assert response.status_code == 200
        data = response.json()
        assert "messages" in data


class TestHealthEndpoint:
    """Test health check endpoint - no lifespan needed."""

    async def test_health(self, client):
        response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
