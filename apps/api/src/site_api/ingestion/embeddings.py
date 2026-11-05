"""The embedding model, created from config (ADR-0001, ADR-0008).

Model, dimensions and key come from `Settings`, never from literals, so the same factory serves
ingestion now and the query embedding of retrieval later (ROADMAP 3.6).
"""

from langchain_openai import OpenAIEmbeddings

from site_api.core.config import Settings


def create_embeddings(settings: Settings) -> OpenAIEmbeddings:
    """Create the OpenAI embeddings client. Creating it makes no API call.

    Raises:
        ValueError: `OPENAI_API_KEY` is not configured.
    """
    if settings.openai_api_key is None:
        raise ValueError("OPENAI_API_KEY is not set: embedding needs it (see .env.example)")
    # `dimensions` asks the API to shorten text-embedding-3-large vectors (3072 by default) to
    # the size of the `vector(1536)` column (ADR-0001: fits pgvector's HNSW limit).
    return OpenAIEmbeddings(
        model=settings.embedding_model,
        dimensions=settings.embedding_dimensions,
        api_key=settings.openai_api_key,
    )
