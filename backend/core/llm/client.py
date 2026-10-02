import logging
import os
import time
from typing import Any, Callable, Optional, Type, TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from .pricing import cost_usd
from .records import CallRecord, Recorder

logger = logging.getLogger(__name__)

DEFAULT_MODEL = 'gemini-2.5-flash'
NON_RETRYABLE_STATUS = frozenset({400, 401, 403, 404})
MAX_ERROR_LENGTH = 1000

T = TypeVar('T', bound=BaseModel)
R = TypeVar('R')


class EmptyResponseError(Exception):
    pass


class LLMClient:
    """Gemini wrapper with structured output, retries and per-call telemetry."""

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        recorder: Optional[Recorder] = None,
        max_attempts: int = 3,
        *,
        genai_client: Any = None,
        retry_backoff_s: float = 0.5,
    ) -> None:
        self.model = (model or os.getenv('GEMINI_MODEL') or DEFAULT_MODEL).removeprefix('models/')
        self.recorder = recorder
        self.max_attempts = max(1, max_attempts)
        self.retry_backoff_s = retry_backoff_s
        if genai_client is None:
            key = api_key or os.getenv('GEMINI_API_KEY')
            genai_client = genai.Client(api_key=key) if key else None
        self._client = genai_client
        self.enabled = genai_client is not None

    def generate_structured(
        self,
        operation: str,
        prompt: str,
        schema: Type[T],
        *,
        system_instruction: Optional[str] = None,
        temperature: Optional[float] = None,
        project_id: Optional[int] = None,
    ) -> Optional[T]:
        config = self._config(system_instruction, temperature, schema)
        return self._run(operation, prompt, config, lambda response: _parse_structured(response, schema), project_id)

    def generate_text(
        self,
        operation: str,
        prompt: str,
        *,
        system_instruction: Optional[str] = None,
        temperature: Optional[float] = None,
        project_id: Optional[int] = None,
    ) -> Optional[str]:
        config = self._config(system_instruction, temperature, None)
        return self._run(operation, prompt, config, _parse_text, project_id)

    @staticmethod
    def _config(
        system_instruction: Optional[str],
        temperature: Optional[float],
        schema: Optional[Type[BaseModel]],
    ) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=temperature,
            response_mime_type='application/json' if schema else None,
            response_schema=schema,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )

    def _run(
        self,
        operation: str,
        prompt: str,
        config: types.GenerateContentConfig,
        parse: Callable[[Any], R],
        project_id: Optional[int],
    ) -> Optional[R]:
        if not self.enabled:
            logger.debug('LLM %s skipped: client disabled', operation)
            return None

        started = time.perf_counter()
        input_tokens = output_tokens = attempts = 0
        error = ''
        result: Optional[R] = None

        while attempts < self.max_attempts:
            attempts += 1
            try:
                response = self._client.models.generate_content(model=self.model, contents=prompt, config=config)
            except Exception as exc:
                error = _describe(exc)
                logger.warning('LLM %s attempt %d/%d failed: %s', operation, attempts, self.max_attempts, error)
                if not _is_retryable(exc):
                    break
                if attempts < self.max_attempts and self.retry_backoff_s > 0:
                    time.sleep(self.retry_backoff_s * 2 ** (attempts - 1))
                continue

            usage = getattr(response, 'usage_metadata', None)
            input_tokens += _count(usage, 'prompt_token_count')
            output_tokens += _count(usage, 'candidates_token_count') + _count(usage, 'thoughts_token_count')
            try:
                result = parse(response)
            except Exception as exc:
                error = _describe(exc)
                logger.warning('LLM %s attempt %d/%d returned invalid output: %s',
                               operation, attempts, self.max_attempts, error)
                continue
            error = ''
            break

        record = CallRecord(
            operation=operation,
            model=self.model,
            latency_ms=round((time.perf_counter() - started) * 1000),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd(self.model, input_tokens, output_tokens),
            attempts=attempts,
            success=result is not None,
            error=error[:MAX_ERROR_LENGTH],
            project_id=project_id,
        )
        if record.success:
            logger.info('LLM %s ok: model=%s attempts=%d latency_ms=%d tokens=%d/%d cost_usd=%.6f',
                        operation, record.model, record.attempts, record.latency_ms,
                        record.input_tokens, record.output_tokens, record.cost_usd)
        else:
            logger.error('LLM %s failed after %d attempt(s): %s', operation, record.attempts, record.error)
        self._emit(record)
        return result

    def _emit(self, record: CallRecord) -> None:
        if self.recorder is None:
            return
        try:
            self.recorder(record)
        except Exception:
            logger.exception('LLM call recorder failed')


def _parse_structured(response: Any, schema: Type[T]) -> T:
    parsed = getattr(response, 'parsed', None)
    if isinstance(parsed, schema):
        return parsed
    text = getattr(response, 'text', None)
    if not text or not text.strip():
        raise EmptyResponseError('empty response')
    return schema.model_validate_json(text)


def _parse_text(response: Any) -> str:
    text = (getattr(response, 'text', None) or '').strip()
    if not text:
        raise EmptyResponseError('empty response')
    return text


def _count(usage: Any, field: str) -> int:
    return int(getattr(usage, field, None) or 0)


def _is_retryable(exc: Exception) -> bool:
    return not (isinstance(exc, errors.ClientError) and exc.code in NON_RETRYABLE_STATUS)


def _describe(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        details = '; '.join(
            f"{'.'.join(str(part) for part in error['loc']) or 'response'}: {error['msg']}"
            for error in exc.errors()[:3]
        )
        return f'ValidationError: {details}'
    return f"{type(exc).__name__}: {' '.join(str(exc).split())}"
