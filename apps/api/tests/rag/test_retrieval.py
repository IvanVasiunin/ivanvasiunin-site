"""Hybrid retrieval with fake searches (ROADMAP 3.6). No database, no API call."""

from langchain_core.embeddings import Embeddings

from site_api.rag.retrieval import (
    HybridRetriever,
    RetrievalParams,
    RetrievedChunk,
    above_floor,
    interleave,
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


def test_weak_tail_sources_below_the_floor_are_dropped() -> None:
    # Found by both searches (~0.98) vs by one only (~0.5): the one-search tail is left out.
    best, weak = candidate("personal:pet:0"), candidate("site_docs:spec:40")
    ranked = [
        RetrievedChunk(best, 0.98),
        RetrievedChunk(candidate("personal:name:0"), 0.87),
        RetrievedChunk(weak, 0.5),
    ]

    kept = above_floor(ranked, 0.6)

    assert [item.chunk.chunk_id for item in kept] == ["personal:pet:0", "personal:name:0"]


def test_when_every_score_is_low_none_is_dropped() -> None:
    # A question in Russian: full text finds nothing, every chunk scores about the same.
    ranked = [RetrievedChunk(candidate(f"cv:job:{i}"), 0.5 - i * 0.01) for i in range(4)]

    assert len(above_floor(ranked, 0.6)) == 4


def test_a_zero_floor_keeps_everything_and_nothing_stays_nothing() -> None:
    ranked = [RetrievedChunk(candidate("cv:a:0"), 0.9), RetrievedChunk(candidate("cv:b:0"), 0.1)]

    assert len(above_floor(ranked, 0.0)) == 2
    assert above_floor([], 0.6) == []


def scored(chunk_id: str, score: float) -> RetrievedChunk:
    return RetrievedChunk(candidate(chunk_id), score)


def test_interleave_takes_each_ranking_in_turn_and_each_chunk_once() -> None:
    education = [scored("edu", 1.0), scored("shared", 0.9), scored("edu-2", 0.5)]
    testing = [scored("jest", 1.0), scored("shared", 0.8)]

    merged = interleave([education, testing])

    assert [item.chunk.chunk_id for item in merged] == ["edu", "jest", "shared", "edu-2"]


class PerQuerySearch(FakeSearch):
    """Each query (its fake embedding is its text length) finds its own chunks."""

    def __init__(self, by_length: dict[int, list[Candidate]]) -> None:
        super().__init__([], [])
        self.by_length = by_length

    async def by_vector(self, embedding: list[float], limit: int) -> list[Candidate]:
        return self.by_length[int(embedding[0])][:limit]

    async def by_text(self, question: str, limit: int) -> list[Candidate]:
        return []


class LengthEmbeddings(FakeQueryEmbeddings):
    """Embeds a query as its length, so each fake query finds its own chunks."""

    def embed_query(self, text: str) -> list[float]:
        return [float(len(text))]


async def test_several_queries_each_bring_their_best_chunks() -> None:
    # SPEC §5.7: one query per requirement; the education chunk is not drowned by the others.
    search = PerQuerySearch(
        {
            1: [candidate("summary"), candidate("profile"), candidate("skills")],
            2: [candidate("education")],
        }
    )
    params = RetrievalParams(candidates=10, top_k=3, max_per_project=2, rrf_k=60, top_k_multi=4)

    result = await HybridRetriever(search, LengthEmbeddings(), params).retrieve_many(["a", "bb"])

    ids = {item.chunk.chunk_id for item in result}
    assert ids == {"summary", "education", "profile", "skills"}
    # Ordered by score for the sources event (SPEC §4.2).
    assert [item.score for item in result] == sorted((item.score for item in result), reverse=True)


async def test_several_queries_stay_under_their_ceiling() -> None:
    search = PerQuerySearch({1: [candidate("a"), candidate("b")], 2: [candidate("c")]})
    params = RetrievalParams(candidates=10, top_k=3, max_per_project=2, rrf_k=60, top_k_multi=2)

    result = await HybridRetriever(search, LengthEmbeddings(), params).retrieve_many(["a", "bb"])

    # The best of each query first: "a" and "c", not "a" and "b".
    assert {item.chunk.chunk_id for item in result} == {"a", "c"}


async def test_one_query_is_plain_retrieval() -> None:
    search = FakeSearch([candidate("a"), candidate("b")], [])
    retriever = HybridRetriever(search, FakeQueryEmbeddings(), PARAMS)

    assert await retriever.retrieve_many(["q"]) == await retriever.retrieve("q")
