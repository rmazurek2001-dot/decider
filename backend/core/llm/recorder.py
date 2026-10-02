import logging

from django.db import transaction

from .records import CallRecord

logger = logging.getLogger(__name__)


def db_recorder(record: CallRecord) -> None:
    """Persist a CallRecord as an LLMCall row; never raises."""
    from core.models import LLMCall, Project

    try:
        project_id = record.project_id
        if project_id is not None and not Project.objects.filter(pk=project_id).exists():
            project_id = None
        with transaction.atomic():
            LLMCall.objects.create(
                operation=record.operation,
                model=record.model,
                latency_ms=record.latency_ms,
                input_tokens=record.input_tokens,
                output_tokens=record.output_tokens,
                cost_usd=record.cost_usd,
                attempts=record.attempts,
                success=record.success,
                error=record.error,
                project_id=project_id,
            )
    except Exception:
        logger.exception('Failed to persist LLM call record for %s', record.operation)
