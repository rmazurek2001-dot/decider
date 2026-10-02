from typing import Any, List, Optional


class FakeUsage:
    def __init__(self, prompt: Optional[int] = None, candidates: Optional[int] = None,
                 thoughts: Optional[int] = None) -> None:
        self.prompt_token_count = prompt
        self.candidates_token_count = candidates
        self.thoughts_token_count = thoughts


class FakeResponse:
    def __init__(self, text: Optional[str] = None, parsed: Any = None, usage: Optional[FakeUsage] = None) -> None:
        self.text = text
        self.parsed = parsed
        self.usage_metadata = usage


class FakeModels:
    def __init__(self, responses: List[Any]) -> None:
        self.responses = list(responses)
        self.calls: List[dict] = []

    def generate_content(self, *, model: str, contents: str, config: Any) -> FakeResponse:
        self.calls.append({'model': model, 'contents': contents, 'config': config})
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class FakeGenaiClient:
    def __init__(self, responses: List[Any]) -> None:
        self.models = FakeModels(responses)
