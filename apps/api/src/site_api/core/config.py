"""Application settings, read once from the environment and `.env`.

Every tunable value (versions, timeouts, origins, model IDs later on) lives here, so code never
reads `os.environ` directly (ruff TID251) and tests can build a `Settings` object with exactly the
values they need.
"""

from pathlib import Path
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The chat-model providers the API can use (ADR-0001); which one is a setting, never code.
type ModelProvider = Literal["openai", "anthropic"]

# A GitHub `owner/name`, the form the README API takes.
GITHUB_REPO_PATTERN = r"^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$"


class ModelPrice(BaseModel):
    """What one model costs, in USD per 1M tokens (for the `usage` event's cost estimate)."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    input: float = Field(ge=0)
    # Input tokens the provider read from its prompt cache (cheaper than fresh input).
    cached_input: float = Field(ge=0)
    output: float = Field(ge=0)


class GithubReadmeSource(BaseModel):
    """One allow-listed public repository whose README joins the knowledge base (ROADMAP 3.5)."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    repo: str = Field(pattern=GITHUB_REPO_PATTERN)
    # The CV project slug (`projects/<slug>.md`), so retrieval deduplicates README chunks and CV
    # chunks of one project together (ROADMAP 3.6).
    project: str = Field(pattern=r"^[a-z0-9-]+$")
    # Repeated in every chunk of the README: what the repository is, so the answer model can
    # label it (SPEC §5.2: study projects are described as study projects). Short on purpose.
    note: str = Field(min_length=1, max_length=300)


def find_env_file(start: Path) -> Path | None:
    """Find the repository's `.env` by walking up from `start` to the folder with `.env.example`.

    Searching for a marker file instead of counting parent folders keeps working wherever the
    package lives. In Docker (ROADMAP 1.6) there is no repository around the installed package, so
    this returns `None` and the values come from the container environment only.
    """
    for folder in start.resolve().parents:
        if (folder / ".env.example").is_file():
            return folder / ".env"
    return None


class Settings(BaseSettings):
    """Typed settings for the API.

    Values come from environment variables (case-insensitive) or the repository's `.env` file.
    Secrets are `SecretStr`, so they never appear in reprs, logs or tracebacks.
    """

    model_config = SettingsConfigDict(
        env_file=find_env_file(Path(__file__)),
        env_file_encoding="utf-8",
        # `.env` also holds values for other tools (Langfuse, Context7); ignore what we do not use.
        extra="ignore",
    )

    # Fail closed: without an explicit APP_ENV the app behaves as production (no interactive
    # docs). Local development sets APP_ENV=development in `.env`.
    app_env: Literal["development", "test", "production"] = "production"
    # The deployed git SHA, set when the image is built (ROADMAP 1.6); `dev` for local runs.
    app_version: str = "dev"

    # Required: there is no safe default for a database URL. Format: `postgresql+psycopg://…`.
    database_url: SecretStr
    # Connection pool for the whole app. Small on purpose: one small VPS, one API process.
    db_pool_size: int = Field(default=5, ge=1, le=20)
    db_max_overflow: int = Field(default=5, ge=0, le=20)
    # How long a request waits for a free pooled connection, and for a new connection to open.
    db_pool_timeout_s: float = Field(default=5.0, gt=0, le=30)
    db_connect_timeout_s: int = Field(default=3, ge=1, le=30)

    # How long `GET /api/health` waits for the database before it reports `db: down`.
    db_health_timeout_s: float = Field(default=2.0, gt=0, le=10)
    # How long one health result is reused: a flood of health checks costs one query per window.
    health_cache_ttl_s: float = Field(default=5.0, ge=0, le=60)

    # Browser origins allowed to call the API (exact, e.g. `["https://ivanvasiunin.com"]`). In
    # development, any `http://localhost:<port>` is allowed on top (the Astro dev server).
    cors_allow_origins: list[str] = Field(default_factory=list)

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # OpenAI key for embeddings (ingestion now, the query embedding later). Optional, so the API
    # and the ingestion estimate run without it; `ingestion --apply` fails clearly when it is unset.
    openai_api_key: SecretStr | None = None
    # ADR-0001: text-embedding-3-large shortened to 1536 dimensions, the `vector(1536)` column of
    # migration 0001. Changing either needs a migration and a full reindex.
    embedding_model: str = "text-embedding-3-large"
    embedding_dimensions: int = Field(default=1536, ge=1, le=3072)
    # USD per 1M input tokens, for the cost estimate printed before any paid embedding run.
    embedding_price_per_1m_tokens: float = Field(default=0.13, ge=0)

    # Chunking (ROADMAP 3.3, docs/ARCHITECTURE.md §5): the maximum body size of one chunk in
    # characters, and how many characters neighbouring pieces of one long section share.
    chunk_size: int = Field(default=1200, ge=200, le=8000)
    chunk_overlap: int = Field(default=150, ge=0, le=1000)

    # The 2D map (ROADMAP 6.1, ADR-0006): UMAP over the chunk embeddings, at ingestion. Starting
    # values, tuned at the decision gate (6.5). A fixed random_state makes the layout deterministic.
    projection_n_neighbors: int = Field(default=15, ge=2, le=200)
    projection_min_dist: float = Field(default=0.1, ge=0, le=1)
    projection_metric: Literal["cosine", "euclidean"] = "cosine"
    projection_random_state: int = 42
    # The fitted model (a joblib file) that places new chunks on the existing map; kept with the
    # data, not in git (RUNBOOK). Relative paths are under the repository root.
    projection_model_path: Path = Path("apps/api/artifacts/projection.joblib")
    # Where ingestion writes points.json (SPEC §4.4): the dev site serves apps/web/public; the
    # server writes to the volume Caddy serves at /data (ARCHITECTURE §5).
    points_json_path: Path = Path("apps/web/public/data/points.json")

    # GitHub READMEs (ROADMAP 3.5). Only these repositories are fetched, only from this owner,
    # without a token: the API then serves public repositories only. Proposed default: the one
    # CV project whose README describes the project (the Little Lemon repository still has the
    # Create React App boilerplate README). Override with GITHUB_READMES='[{...}]' (JSON).
    github_owner: str = "IvanVasiunin"
    github_readmes: list[GithubReadmeSource] = Field(
        default_factory=lambda: [
            GithubReadmeSource(
                repo="IvanVasiunin/NumbersValidator",
                project="numbers-validator",
                note=(
                    "README of NumbersValidator, a production web tool Ivan built at "
                    "Liketelecom, from his public GitHub repository."
                ),
            ),
        ]
    )
    github_api_url: str = "https://api.github.com"
    github_timeout_s: float = Field(default=10.0, gt=0, le=60)

    # Hybrid retrieval (ROADMAP 3.6, ADR-0003). Each search (vector, full-text) returns this many
    # candidates; RRF fuses them; at most `retrieval_max_per_project` chunks of one project are
    # kept, and the best `retrieval_top_k` go to the answer model. Starting values, tuned by evals.
    retrieval_candidates: int = Field(default=20, ge=1, le=200)
    retrieval_top_k: int = Field(default=6, ge=1, le=50)
    retrieval_max_per_project: int = Field(default=2, ge=1, le=50)
    # The RRF constant: 60 is the value of the original paper (Cormack et al., 2009); a larger k
    # flattens the difference between ranks.
    retrieval_rrf_k: int = Field(default=60, ge=1, le=1000)
    # Evals (ROADMAP 4.5, docs/TESTING.md): a cheap judge model scores in-scope answers
    # (faithfulness to the sources, relevancy to the question); a run below any threshold fails.
    eval_judge_provider: ModelProvider = "openai"
    eval_judge_model: str = Field(default="gpt-6-luna", min_length=1)
    eval_judge_max_output_tokens: int = Field(default=1500, ge=100, le=8000)
    eval_judge_timeout_s: float = Field(default=60.0, gt=0, le=300)
    eval_judge_max_retries: int = Field(default=1, ge=0, le=3)
    eval_judge_reasoning_effort: Literal["none", "low", "medium", "high"] = "none"
    # A run stops before its next case once it has cost this many times its estimate.
    eval_max_cost_factor: float = Field(default=3.0, ge=1, le=20)
    eval_min_router_accuracy: float = Field(default=0.9, ge=0, le=1)
    eval_min_rule_pass_rate: float = Field(default=0.85, ge=0, le=1)
    eval_min_faithfulness: float = Field(default=0.8, ge=0, le=1)
    eval_min_answer_relevancy: float = Field(default=0.7, ge=0, le=1)

    # The relevance gate (ROADMAP 4.3, rag/relevance.py): below this cosine similarity between the
    # question and its closest chunk, Elio answers with the "no information" template instead of
    # calling the answer model. A starting value for text-embedding-3-large (unrelated text scores
    # roughly 0.1-0.25 with it, related text noticeably more); UNVERIFIED for this corpus until
    # the evals of ROADMAP 4.5 calibrate it.
    relevance_min_similarity: float = Field(default=0.3, ge=0, le=1)

    # The answer model (ROADMAP 3.7, ADR-0001 / ADR-0008). Provider and model are config only:
    # switching OpenAI ↔ Anthropic is ANSWER_PROVIDER + ANSWER_MODEL (e.g. `anthropic` +
    # `claude-haiku-5-5`) and the matching API key, with no code change.
    answer_provider: ModelProvider = "openai"
    answer_model: str = Field(default="gpt-6.1-terra", min_length=1)
    # OpenAI only (ignored for Anthropic): `none` keeps the time to the first token low (SPEC: TTFT
    # p50 < 2 s); the model's own default is `medium`.
    answer_reasoning_effort: Literal["none", "low", "medium", "high"] = "none"
    # A cap on one answer: Elio's answers are short (SPEC §5), and a runaway answer costs money.
    # An answer cut by it ends with `finish_reason: "length"`.
    answer_max_output_tokens: int = Field(default=800, ge=50, le=4000)
    # How long one model request may take, and how many times the client retries a failed one.
    answer_timeout_s: float = Field(default=30.0, gt=0, le=120)
    answer_max_retries: int = Field(default=1, ge=0, le=3)
    # Anthropic key, needed only when a provider setting is `anthropic`.
    anthropic_api_key: SecretStr | None = None

    # The router (ROADMAP 4.2, ADR-0004 layer 2): a cheap, fast model that sorts every question
    # into one of the SPEC §5 classes and detects its language, before any retrieval or answer.
    # Its output is a few tokens of structured data, so the cap is small.
    router_provider: ModelProvider = "openai"
    router_model: str = Field(default="gpt-6-luna", min_length=1)
    router_reasoning_effort: Literal["none", "low", "medium", "high"] = "none"
    router_max_output_tokens: int = Field(default=60, ge=20, le=500)
    router_timeout_s: float = Field(default=10.0, gt=0, le=60)
    router_max_retries: int = Field(default=1, ge=0, le=3)
    # Earlier turns the router sees, so a follow-up ("and his skills?") keeps its topic.
    router_history_turns: int = Field(default=2, ge=0, le=10)
    # Chat model prices, by model ID. OpenAI: ADR-0001, Standard tier as of 2026-11-01.
    # Anthropic: first-party API rates as of 2026-10-06 (Haiku 5.5 for prompts up to 100K tokens;
    # a cache read costs 0.1x input). The answer model must be listed (checked at startup), so
    # every answer has a cost estimate and the provider switch stays a config change. Another
    # model is added with MODEL_PRICES='{"<id>": {"input": …, "cached_input": …, "output": …}}'
    # (JSON; it replaces the whole table, so repeat the models still in use).
    model_prices: dict[str, ModelPrice] = Field(
        default_factory=lambda: {
            "gpt-6.1-terra": ModelPrice(input=1.0, cached_input=0.05, output=5.0),
            "gpt-6-luna": ModelPrice(input=0.10, cached_input=0.01, output=0.50),
            "claude-haiku-5-5": ModelPrice(input=0.10, cached_input=0.01, output=0.50),
            "claude-sonnet-5-5": ModelPrice(input=2.0, cached_input=0.20, output=10.0),
        }
    )

    # Chat request limits (SPEC §4.1). A longer question is rejected with `input_too_long`; only
    # the last `history_max_turns` turns of the client's history reach the model, each cut to
    # `history_turn_max_chars` (the history is untrusted: without a cap it multiplies the cost).
    max_question_chars: int = Field(default=500, ge=1, le=4000)
    history_max_turns: int = Field(default=6, ge=0, le=40)
    history_turn_max_chars: int = Field(default=2000, ge=1, le=4000)
    # The longest one answer may take, retrieval included; then it ends with `timeout`. The model's
    # own timeout covers one request only, and a slowly trickling stream could last much longer.
    chat_total_timeout_s: float = Field(default=60.0, gt=0, le=300)

    # Abuse and spend limits (ROADMAP 4.1, ADR-0004), all checked before any model call. Per IP is
    # the real enforcement; per session is a UX nicety (the client makes the session ID). A rough
    # scale: one answer costs about $0.0065 (ADR-0001), so $1 is about 150 answers a day.
    chat_requests_per_minute_per_ip: int = Field(default=6, ge=1, le=600)
    chat_requests_per_day_per_ip: int = Field(default=60, ge=1, le=100_000)
    # Answers one IP may receive at the same time (a stream lasts up to CHAT_TOTAL_TIMEOUT_S).
    chat_streams_per_ip: int = Field(default=2, ge=1, le=50)
    session_max_questions: int = Field(default=30, ge=1, le=1000)
    # The estimated spend of all answers per UTC day; then `budget_exceeded` until midnight UTC.
    daily_budget_usd: float = Field(default=1.0, gt=0, le=1000)

    # Tracing (ROADMAP 4.6, ADR-0001): Langfuse Cloud, EU region. Off unless both keys are set;
    # every exported span is masked first (services/tracing.py, SPEC §6.6).
    langfuse_public_key: str | None = None
    langfuse_secret_key: SecretStr | None = None
    langfuse_host: str = "https://cloud.langfuse.com"

    # Chat statistics (ROADMAP 4.6, SPEC §6.6): rows older than this are deleted by a job that
    # runs at startup and then every `chat_stats_purge_interval_s`.
    chat_stats_retention_days: int = Field(default=30, ge=1, le=365)
    chat_stats_purge_interval_s: float = Field(default=6 * 3600, ge=60, le=7 * 24 * 3600)

    @field_validator("cors_allow_origins")
    @classmethod
    def _explicit_origins_only(cls, origins: list[str]) -> list[str]:
        """Accept only exact origins: `https://host[:port]`, no `*`, path, slash or `null`.

        Browsers send the origin in exactly this form and the CORS check compares strings, so
        `https://ivanvasiunin.com/` (with a slash) would silently never match. `*` would let any
        site call the API (fastapi.md, Security); `null` would allow sandboxed pages and files.
        """
        for origin in origins:
            if "*" in origin:
                msg = "CORS origins must be explicit; '*' is not allowed"
                raise ValueError(msg)
            parts = urlsplit(origin)
            if (
                parts.scheme not in {"http", "https"}
                or not parts.netloc
                or parts.path
                or parts.query
                or parts.fragment
            ):
                msg = f"CORS origin must look like https://example.com[:port], got {origin!r}"
                raise ValueError(msg)
        return origins

    @model_validator(mode="after")
    def _readmes_from_the_owner_only(self) -> Self:
        """Every allow-listed README must belong to `github_owner` (rules/langchain-rag.md).

        A typo or a pasted third-party repository would otherwise put someone else's text into
        what Elio says about Ivan.
        """
        for source in self.github_readmes:
            owner = source.repo.split("/", 1)[0]
            if owner.lower() != self.github_owner.lower():
                msg = f"README {source.repo!r} is not owned by {self.github_owner!r}"
                raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def _the_chat_models_have_prices(self) -> Self:
        """Fail at startup, not in the first answer, when a chat model has no price."""
        roles = (
            ("answer", self.answer_model),
            ("router", self.router_model),
            ("eval judge", self.eval_judge_model),
        )
        for role, model in roles:
            if model not in self.model_prices:
                msg = f"MODEL_PRICES has no price for the {role} model {model!r}"
                raise ValueError(msg)
        return self

    @property
    def is_production(self) -> bool:
        """Whether this is the deployed site (it hides the API docs and schema, for one)."""
        return self.app_env == "production"
