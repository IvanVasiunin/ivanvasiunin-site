"""Run the eval cases through Elio's real graph (ROADMAP 4.5). Paid: only with Ivan's consent.

Every case goes through the same `ChatService` the API uses (router, retrieval, gate, answer or
template), so an eval measures what visitors get. The retriever is wrapped to keep the chunks of
the latest answer: the judge needs their full text, not the 200-character snippets of `sources`.
"""

import logging
import uuid
from collections.abc import Sequence
from typing import Protocol

from site_api.core.config import Settings
from site_api.db.engine import create_engine
from site_api.evals.cases import EvalCase
from site_api.evals.checks import check_answer, read_answer
from site_api.evals.report import CaseResult
from site_api.graph.models import (
    ModelSpec,
    build_answer_model,
    build_chat_model,
    build_router_model,
)
from site_api.graph.nodes import ChatModels, Retriever
from site_api.ingestion.embeddings import create_embeddings
from site_api.rag.retrieval import HybridRetriever, RetrievalParams, RetrievedChunk
from site_api.rag.search import PostgresChunkSearch
from site_api.schemas.chat import ChatRequest
from site_api.services.chat import ChatService
from site_api.services.limits import DailySpend

logger: logging.Logger = logging.getLogger(__name__)


class RecordingRetriever:
    """Passes retrieval through and keeps the chunks of the latest question."""

    def __init__(self, inner: Retriever) -> None:
        """Wrap the real retriever."""
        self._inner = inner
        self.last: list[RetrievedChunk] = []

    async def retrieve(self, question: str) -> list[RetrievedChunk]:
        """Retrieve and remember what came back."""
        self.last = await self._inner.retrieve(question)
        return self.last


class Judge(Protocol):
    """What the runner needs from the judge (`evals/judge.py`; a fake in tests)."""

    @property
    def cost_usd(self) -> float:
        """What the judge has cost so far, in USD."""
        ...

    async def scores(
        self, question: str, answer: str, contexts: Sequence[str]
    ) -> tuple[float, float]:
        """Faithfulness and answer relevancy, 0..1."""
        ...


async def run_cases(
    service: ChatService,
    retriever: RecordingRetriever,
    cases: Sequence[EvalCase],
    judge: Judge | None,
    max_cost_usd: float = float("inf"),
) -> list[CaseResult]:
    """Ask every case once, check its answer and, when asked, judge it.

    Stops before the next case once the run has cost `max_cost_usd`: a run that costs far more
    than its estimate is a bug to look at, not something to pay for to the end.
    """
    results: list[CaseResult] = []
    spent = 0.0
    for case in cases:
        if spent >= max_cost_usd:
            logger.warning("eval run stopped at its cost cap", extra={"count": len(results)})
            break
        retriever.last = []
        request = ChatRequest(message=case.question, session_id=uuid.uuid4())
        events = [event async for event in service.answer(request)]
        answer = read_answer(events)
        faithfulness: float | None = None
        relevancy: float | None = None
        judge_cost = 0.0
        judge_error: str | None = None
        # Judge only a real answer written from sources: a template or "no information" has
        # nothing to be faithful to.
        if judge is not None and case.judged and answer.text and retriever.last:
            before = judge.cost_usd
            contexts = [item.chunk.content for item in retriever.last]
            try:
                faithfulness, relevancy = await judge.scores(case.question, answer.text, contexts)
            except Exception as error:
                # A judge reply that did not parse costs this case its scores, not the whole
                # (already paid) run; the report counts it as unmeasured.
                judge_error = type(error).__name__
            judge_cost = judge.cost_usd - before
        spent += answer.cost_usd + judge_cost
        results.append(
            CaseResult(
                case=case,
                answer=answer,
                checks=check_answer(case, answer),
                faithfulness=faithfulness,
                answer_relevancy=relevancy,
                judge_cost_usd=round(judge_cost, 6),
                judge_error=judge_error,
            )
        )
    return results


async def run_suite(
    cases: Sequence[EvalCase], settings: Settings, max_cost_usd: float
) -> list[CaseResult]:
    """Build the real dependencies (database, models, judge) and run the cases. Paid."""
    # Imported here, not at the top: DeepEval is a dev dependency, needed only for a real run.
    from site_api.evals.judge import DeepEvalJudge  # noqa: PLC0415

    engine = create_engine(settings)
    try:
        retriever = RecordingRetriever(
            HybridRetriever(
                PostgresChunkSearch(engine),
                create_embeddings(settings),
                RetrievalParams.from_settings(settings),
            )
        )
        models = ChatModels(
            router=build_router_model(settings), answer=build_answer_model(settings)
        )
        # The eval run is not limited by the site's daily budget; the spend only counts its cost.
        service = ChatService(retriever, models, settings, DailySpend(float("inf")))
        judge_spec = ModelSpec(
            provider=settings.eval_judge_provider,
            model=settings.eval_judge_model,
            max_output_tokens=settings.eval_judge_max_output_tokens,
            timeout_s=settings.eval_judge_timeout_s,
            max_retries=settings.eval_judge_max_retries,
            reasoning_effort=settings.eval_judge_reasoning_effort,
        )
        judge = DeepEvalJudge(
            build_chat_model(judge_spec, settings),
            settings.eval_judge_model,
            settings.model_prices[settings.eval_judge_model],
        )
        return await run_cases(service, retriever, cases, judge, max_cost_usd)
    finally:
        await engine.dispose()
