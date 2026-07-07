"""Pytest conftest definitions for the ArenaOS backend.

Defines fixtures used across multiple test modules, such as a TestClient
instance for API interaction.
"""

from typing import Generator
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def test_client() -> Generator[TestClient, None, None]:
    """Provides a shared FastAPI TestClient instance for endpoint integration tests."""
    with TestClient(app) as client:
        yield client
