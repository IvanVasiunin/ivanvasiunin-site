"""What an eval run will cost, before anything is called (ROADMAP 4.5, CLAUDE.md golden rule 13).

Evals call real models: the router for every case, the embedding and the answer model for the
questions about Ivan, and the judge for the judged ones. The estimate multiplies typical token
counts by the prices in config, and errs high: it is a ceiling to agree on, not an invoice. The
token counts are assumptions about this project's prompts (sizes measured from the prompt files
and `retrieval_top_k`), revised when a recorded run shows them far off.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from site_api.core.config import Settings
from site_api.evals.cases import EvalCase
from site_api.graph.generate import TokenUsage
from site_api.graph.usage import estimate_cost_usd

# Router: its prompt (~600 tokens), up to two history turns, the question; a few tokens of JSON.
ROUTER_CALL = TokenUsage(input_tokens=900, cached_input_tokens=0, output_tokens=30)
# Answer: the system prompt (~900), `top_k` chunks of up to ~300 tokens each, the question.
ANSWER_PROMPT_BASE_TOKENS = 1000
ANSWER_TOKENS_PER_CHUNK = 300
# Judge: DeepEval's faithfulness (truths, claims, verdicts) and answer relevancy (statements,
# verdicts) without reasons: 5 calls, each reading the answer and, for faithfulness, the context.
JUDGE_CALLS_PER_CASE = 5
JUDGE_CALL = TokenUsage(input_tokens=2500, cached_input_tokens=0, output_tokens=400)
# The question's embedding: a few dozen tokens.
EMBEDDING_TOKENS_PER_QUESTION = 50


@dataclass(frozen=True, slots=True)
class Estimate:
    """The expected calls and cost of one run, by kind of call."""

    cases: int
    answered: int
    judged: int
    router_usd: float
    answer_usd: float
    judge_usd: float
    embedding_usd: float

    @property
    def total_usd(self) -> float:
        """Everything together."""
        return round(self.router_usd + self.answer_usd + self.judge_usd + self.embedding_usd, 4)


def estimate_run(cases: Sequence[EvalCase], settings: Settings) -> Estimate:
    """The cost ceiling of running `cases` once with the models and prices in `settings`."""
    answered = [case for case in cases if case.route == "about_ivan"]
    judged = [case for case in cases if case.judged]
    prices = settings.model_prices
    answer_call = TokenUsage(
        input_tokens=ANSWER_PROMPT_BASE_TOKENS + settings.retrieval_top_k * ANSWER_TOKENS_PER_CHUNK,
        cached_input_tokens=0,
        # The cap, not a typical answer: the estimate is a ceiling.
        output_tokens=settings.answer_max_output_tokens,
    )
    router_usd = len(cases) * estimate_cost_usd(prices[settings.router_model], ROUTER_CALL)
    answer_usd = len(answered) * estimate_cost_usd(prices[settings.answer_model], answer_call)
    judge_usd = (
        len(judged)
        * JUDGE_CALLS_PER_CASE
        * estimate_cost_usd(prices[settings.eval_judge_model], JUDGE_CALL)
    )
    embedding_usd = (
        len(answered) * EMBEDDING_TOKENS_PER_QUESTION * settings.embedding_price_per_1m_tokens
    ) / 1_000_000
    return Estimate(
        cases=len(cases),
        answered=len(answered),
        judged=len(judged),
        router_usd=round(router_usd, 4),
        answer_usd=round(answer_usd, 4),
        judge_usd=round(judge_usd, 4),
        embedding_usd=round(embedding_usd, 6),
    )


def format_estimate(estimate: Estimate) -> str:
    """The estimate as the lines the CLI prints."""
    return "\n".join(
        [
            f"Eval cases: {estimate.cases} "
            f"({estimate.answered} answered by the answer model, {estimate.judged} judged).",
            f"  router:     ${estimate.router_usd:.4f}",
            f"  answers:    ${estimate.answer_usd:.4f}",
            f"  judge:      ${estimate.judge_usd:.4f}",
            f"  embeddings: ${estimate.embedding_usd:.6f}",
            f"Estimated cost (a ceiling): ${estimate.total_usd:.2f}",
        ]
    )
