"""Hybrid retrieval with fake searches (ROADMAP 3.6). No database, no API call."""

from langchain_core.embeddings import Embeddings

from site_api.rag.retrieval import (
    HybridRetriever,
    RetrievalParams,
    RetrievedChunk,
    limit_per_project,
)
from site_api.rag.search import Candidate

PARAMS = RetrievalParams(candidates=10, top_k=3, max_per_project=2, rrf_k=60)


def candidate(chunk_id: str, project: str | None = None) -> Candidate:
    return Candidate(
        chunk_id=chunk_id,
        content=f"Text of {chunk_id}.",
        source_type="cv",
        category="job",
        section="Section",
        project=project,
        url=None,
    )


class FakeSearch:
    """Returns fixed rankings and remembers what it was asked."""

    def __init__(self, by_vector: list[Candidate], by_text: list[Candidate]) -> None:
        self.vector_result = by_vector
        self.text_result = by_text
        self.asked: list[tuple[str, object, int]] = []

    async def by_vector(self, embedding: list[float], limit: int) -> list[Candidate]:
        self.asked.append(("vector", embedding, limit))
        return self.vector_result[:limit]

    async def by_text(self, question: str, limit: int) -> list[Candidate]:
        self.asked.append(("text", question, limit))
        return self.text_result[:limit]


class FakeQueryEmbeddings(Embeddings):
    """Embeds a question as a fixed vector; counts calls."""

    def __init__(self) -> None:
        self.questions: list[str] = []

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError("retrieval embeds queries only")

    def embed_query(self, text: str) -> list[float]:
        self.questions.append(text)
        return [1.0, 0.0, 0.0]


async def test_the_question_drives_both_searches() -> None:
    search = FakeSearch([candidate("cv:a:0")], [candidate("cv:a:0")])
    embeddings = FakeQueryEmbeddings()

    await HybridRetriever(search, embeddings, PARAMS).retrieve("Where does Ivan work?")

    assert embeddings.questions == ["Where does Ivan work?"]
    assert search.asked == [
        ("vector", [1.0, 0.0, 0.0], 10),
        ("text", "Where does Ivan work?", 10),
    ]


async def test_a_chunk_both_searches_found_ranks_first() -> None:
    search = FakeSearch(
        by_vector=[candidate("cv:a:0"), candidate("cv:b:0")],
        by_text=[candidate("cv:c:0"), candidate("cv:b:0")],
    )

    result = await HybridRetriever(search, FakeQueryEmbeddings(), PARAMS).retrieve("q")

    assert result[0].chunk.chunk_id == "cv:b:0"
    assert all(0 < item.score <= 1 for item in result)


async def test_text_only_matches_are_kept() -> None:
    # An exact term ("BEM") the embedding missed still reaches the answer.
    search = FakeSearch(by_vector=[], by_text=[candidate("experience:notes:3")])

    result = await HybridRetriever(search, FakeQueryEmbeddings(), PARAMS).retrieve("BEM")

    assert [item.chunk.chunk_id for item in result] == ["experience:notes:3"]


async def test_at_most_top_k_results() -> None:
    many = [candidate(f"cv:x{n}:0") for n in range(8)]
    search = FakeSearch(by_vector=many, by_text=[])

    result = await HybridRetriever(search, FakeQueryEmbeddings(), PARAMS).retrieve("q")

    assert len(result) == PARAMS.top_k


async def test_one_project_does_not_fill_the_context() -> None:
    readme = [candidate(f"github_readme:nv:{n}", project="nv") for n in range(5)]
    search = FakeSearch(by_vector=[*readme, candidate("cv:liketelecom:0")], by_text=[])

    result = await HybridRetriever(search, FakeQueryEmbeddings(), PARAMS).retrieve("q")

    ids = [item.chunk.chunk_id for item in result]
    assert ids == ["github_readme:nv:0", "github_readme:nv:1", "cv:liketelecom:0"]


def test_chunks_without_a_project_are_not_limited() -> None:
    items = [RetrievedChunk(candidate(f"experience:notes:{n}"), 0.5) for n in range(4)]

    assert limit_per_project(items, max_per_project=1) == items


def test_limit_keeps_the_best_of_each_project() -> None:
    items = [
        RetrievedChunk(candidate("cv:a:0", project="a"), 0.9),
        RetrievedChunk(candidate("cv:b:0", project="b"), 0.8),
        RetrievedChunk(candidate("cv:a:1", project="a"), 0.7),
    ]

    kept = limit_per_project(items, max_per_project=1)

    assert [item.chunk.chunk_id for item in kept] == ["cv:a:0", "cv:b:0"]
