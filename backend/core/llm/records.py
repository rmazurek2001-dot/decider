from dataclasses import dataclass
from typing import Callable, Optional


@dataclass(frozen=True)
class CallRecord:
    operation: str
    model: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    attempts: int
    success: bool
    error: str = ''
    project_id: Optional[int] = None


Recorder = Callable[[CallRecord], None]
