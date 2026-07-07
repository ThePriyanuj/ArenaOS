import os

import chromadb
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

load_dotenv()


class VectorStorageManager:
    """
    Manages vector representations and database operations for the stadium platform.
    Ensures that RAG retrieval runs on localized vector stores to minimize latency.
    """
    def __init__(self):
        # Local storage database configuration path
        self.db_path = os.getenv("CHROMA_DB_PATH", "./chroma_db")
        self.client = chromadb.PersistentClient(path=self.db_path)
        
        # Load SentenceTransformers model to output 384-dimensional vector embeddings
        self.embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        self.collection = self.client.get_or_create_collection("stadium_protocols")
        
        # Seed protocols automatically if the collection is empty
        self._seed_protocols_if_empty()

    def _seed_protocols_if_empty(self):
        if self.collection.count() == 0:
            protocols = [
                # Fan protocols
                {
                    "id": "fan_exit",
                    "document": "Exit procedure for Fan: In case of emergency, proceed to the nearest marked exit gate (Gate A, B, or C). Exits A & B are primary flow channels. Do not use elevators.",
                    "metadata": {"role_permission": "fan"}
                },
                {
                    "id": "fan_restroom",
                    "document": "Restroom locations for Fan: Public restrooms are situated on all main concourses (Level 1 and Level 2) near the food courts. Follow the blue signs.",
                    "metadata": {"role_permission": "fan"}
                },
                {
                    "id": "fan_concessions",
                    "document": "Concession stands for Fan: Food and beverage stalls are located at North and South Concourses, offering refreshments and merchandise.",
                    "metadata": {"role_permission": "fan"}
                },
                # Staff protocols
                {
                    "id": "staff_evac",
                    "document": "Evacuation protocol for Staff: Verify all safety doors are unlocked. Direct spectators to alternate gates (like Gate C) using megaphones and clear hand gestures.",
                    "metadata": {"role_permission": "staff"}
                },
                {
                    "id": "staff_flow",
                    "document": "Crowd flow monitoring for Staff: Actively monitor crowd densities. If density reaches or exceeds 4.0 people/m², initiate diversion plans and notify zone supervision.",
                    "metadata": {"role_permission": "staff"}
                },
                {
                    "id": "staff_comms",
                    "document": "Communication protocol for Staff: Use radio channel 4 for stadium operations and channel 9 for medical emergencies.",
                    "metadata": {"role_permission": "staff"}
                },
                # Volunteer protocols
                {
                    "id": "volunteer_assist",
                    "document": "Spectator assistance for Volunteer: Assist fans with mobility challenges. Wheelchairs and sensory bags are available at first aid stations.",
                    "metadata": {"role_permission": "volunteer"}
                },
                {
                    "id": "volunteer_lost",
                    "document": "Lost child protocol for Volunteer: Safely escort lost children to the security command office situated in West Concourse.",
                    "metadata": {"role_permission": "volunteer"}
                },
                {
                    "id": "volunteer_translation",
                    "document": "Translation services for Volunteer: Multi-language guides and translation devices can be requested at the information desks.",
                    "metadata": {"role_permission": "volunteer"}
                }
            ]
            
            ids = [p["id"] for p in protocols]
            documents = [p["document"] for p in protocols]
            metadatas = [p["metadata"] for p in protocols]
            embeddings = self.embedding_model.encode(documents).tolist()
            
            self.collection.add(
                ids=ids,
                documents=documents,
                metadatas=metadatas,
                embeddings=embeddings
            )

    def retrieve_grounded_context(self, sanitized_query: str, user_role: str, limit: int = 3) -> list[str]:
        # Convert raw text into its vector space representation
        query_vector = self.embedding_model.encode(sanitized_query).tolist()
        
        # Search the vector store for matching operational documents
        results = self.collection.query(
            query_embeddings=[query_vector],
            n_results=limit,
            where={"role_permission": {"$eq": user_role}}
        )
        
        return results["documents"][0] if results["documents"] else []

