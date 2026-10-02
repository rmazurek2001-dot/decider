import pytest

from core.llm.client import LLMClient
from core.services.ai_service import ai_service


@pytest.fixture(autouse=True)
def offline_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_MODEL'):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(ai_service, 'client', LLMClient())
    monkeypatch.setattr(ai_service, 'enabled', False)
