"""Vector storage manager for ArenaOS RAG retrieval.

Manages a ChromaDB persistent collection of stadium operational protocols
and uses SentenceTransformer embeddings for semantic similarity search.
Includes an in-memory LRU cache to avoid redundant embedding computations
and vector lookups for repeated queries.
"""

import logging
import os
from functools import lru_cache
from typing import Optional

import chromadb
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

load_dotenv()

logger = logging.getLogger("arenaos.database")

# Thread-safe global model instance to avoid class method LRU cache memory leaks (B019)
_EMBEDDING_MODEL: Optional[SentenceTransformer] = None


def get_embedding_model() -> SentenceTransformer:
    """Retrieve or load the global SentenceTransformer model instance."""
    global _EMBEDDING_MODEL
    if _EMBEDDING_MODEL is None:
        logger.info("Loading SentenceTransformer model (all-MiniLM-L6-v2)")
        _EMBEDDING_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _EMBEDDING_MODEL


@lru_cache(maxsize=512)
def _encode_query_cached(query_text: str) -> tuple[float, ...]:
    """Compute and cache the embedding vector for a query string.

    Module-level function prevents memory leaks associated with caching
    instance methods (ruff rule B019).
    """
    model = get_embedding_model()
    return tuple(model.encode(query_text).tolist())


# Module-level seed data keeps the class initialiser focused on wiring
SEED_PROTOCOLS: list[dict[str, str | dict[str, str]]] = [
    # Fan protocols
    {
        "id": "fan_exit",
        "document": (
            "Exit procedure for Fan: In case of emergency, proceed to the "
            "nearest marked exit gate (Gate A, B, or C). Exits A & B are "
            "primary flow channels. Do not use elevators."
        ),
        "metadata": {"role_permission": "fan"},
    },
    {
        "id": "fan_restroom",
        "document": (
            "Restroom locations for Fan: Public restrooms are situated on "
            "all main concourses (Level 1 and Level 2) near the food "
            "courts. Follow the blue signs."
        ),
        "metadata": {"role_permission": "fan"},
    },
    {
        "id": "fan_concessions",
        "document": (
            "Concession stands for Fan: Food and beverage stalls are "
            "located at North and South Concourses, offering refreshments "
            "and merchandise."
        ),
        "metadata": {"role_permission": "fan"},
    },
    # Staff protocols
    {
        "id": "staff_evac",
        "document": (
            "Evacuation protocol for Staff: Verify all safety doors are "
            "unlocked. Direct spectators to alternate gates (like Gate C) "
            "using megaphones and clear hand gestures."
        ),
        "metadata": {"role_permission": "staff"},
    },
    {
        "id": "staff_flow",
        "document": (
            "Crowd flow monitoring for Staff: Actively monitor crowd "
            "densities. If density reaches or exceeds 4.0 people/m², "
            "initiate diversion plans and notify zone supervision."
        ),
        "metadata": {"role_permission": "staff"},
    },
    {
        "id": "staff_comms",
        "document": (
            "Communication protocol for Staff: Use radio channel 4 for "
            "stadium operations and channel 9 for medical emergencies."
        ),
        "metadata": {"role_permission": "staff"},
    },
    # Volunteer protocols
    {
        "id": "volunteer_assist",
        "document": (
            "Spectator assistance for Volunteer: Assist fans with mobility "
            "challenges. Wheelchairs and sensory bags are available at "
            "first aid stations."
        ),
        "metadata": {"role_permission": "volunteer"},
    },
    {
        "id": "volunteer_lost",
        "document": (
            "Lost child protocol for Volunteer: Safely escort lost "
            "children to the security command office situated in West "
            "Concourse."
        ),
        "metadata": {"role_permission": "volunteer"},
    },
    {
        "id": "volunteer_translation",
        "document": (
            "Translation services for Volunteer: Multi-language guides "
            "and translation devices can be requested at the information "
            "desks."
        ),
        "metadata": {"role_permission": "volunteer"},
    },
]


class VectorStorageManager:
    """Manages vector representations and ChromaDB operations for ArenaOS.

    Encapsulates the embedding model, persistent vector collection, and
    provides cached semantic retrieval to minimise latency on repeated
    or similar queries.

    Attributes:
        db_path: Filesystem path to the ChromaDB persistent storage.
        client: ChromaDB persistent client instance.
        embedding_model: SentenceTransformer model for 384-dim embeddings.
        collection: ChromaDB collection storing stadium protocols.
    """

    def __init__(self, db_path: Optional[str] = None) -> None:
        """Initialise the vector store, model, and seed data.

        Args:
            db_path: Override path for the ChromaDB storage directory.
                     Defaults to the ``CHROMA_DB_PATH`` env var or
                     ``./chroma_db``.
        """
        self.db_path: str = db_path or os.getenv(
            "CHROMA_DB_PATH", "./chroma_db"
        )
        self.client = chromadb.PersistentClient(path=self.db_path)

        # Load SentenceTransformers model (384-dimensional embeddings)
        self.embedding_model = get_embedding_model()

        self.collection = self.client.get_or_create_collection(
            "stadium_protocols"
        )

        # Seed protocols automatically if the collection is empty
        self._seed_protocols_if_empty()
        logger.info(
            "VectorStorageManager ready – %d documents in collection",
            self.collection.count(),
        )

    def _seed_protocols_if_empty(self) -> None:
        """Populate the collection with default operational protocols.

        Only runs when the collection is empty, ensuring idempotent
        initialisation across restarts.
        """
        if self.collection.count() > 0:
            return

        logger.info("Seeding %d operational protocols", len(SEED_PROTOCOLS))

        ids = [str(p["id"]) for p in SEED_PROTOCOLS]
        documents = [str(p["document"]) for p in SEED_PROTOCOLS]
        metadatas = [p["metadata"] for p in SEED_PROTOCOLS]  # type: ignore[misc]

        embeddings = self.embedding_model.encode(documents).tolist()

        self.collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
            embeddings=embeddings,
        )

    def retrieve_grounded_context(
        self,
        sanitized_query: str,
        user_role: str,
        limit: int = 3,
    ) -> list[str]:
        """Retrieve the most relevant operational documents for a query.

        Uses cached embedding vectors and role-based metadata filtering
        to return grounded context documents from the vector store.

        Args:
            sanitized_query: Pre-screened user query text.
            user_role: One of ``fan``, ``staff``, or ``volunteer``.
            limit: Maximum number of documents to return.

        Returns:
            A list of matched document strings, ordered by relevance.
            Returns an empty list when no documents match.
        """
        query_vector = list(_encode_query_cached(sanitized_query))

        results = self.collection.query(
            query_embeddings=[query_vector],
            n_results=limit,
            where={"role_permission": {"$eq": user_role}},
        )

        matched_docs = (
            results["documents"][0] if results["documents"] else []
        )

        logger.info(
            "Query role=%s results=%d query=%r",
            user_role,
            len(matched_docs),
            sanitized_query[:80],
        )

        return matched_docs
