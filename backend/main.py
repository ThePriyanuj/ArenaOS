from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.database.connection import VectorStorageManager
from backend.guardrails.security_filters import analyze_input_integrity

app = FastAPI(
    title="ArenaOS - Smart Stadium Operations Engine",
    version="1.0.0",
    description="Asynchronous engine providing real-time operations guidance and crowd dynamics calculations for ArenaOS."
)

# Enable CORS for frontend integration (restrict to trusted localhost origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OperationQuery(BaseModel):
    query_text: str = Field(..., max_length=512)
    user_role: str = Field(..., pattern="^(fan|staff|volunteer)$")

class UnifiedResponse(BaseModel):
    grounded_answer: str
    status: str

class CrowdParameters(BaseModel):
    density: float = Field(..., ge=0.0, le=10.0)
    velocity_deviation: float = Field(..., ge=0.0, le=1.0)
    acoustic_db: float = Field(..., ge=30.0, le=120.0)
    channel_width: float = Field(..., ge=0.5, le=20.0)

class CrowdMetricsResponse(BaseModel):
    walking_velocity: float
    flow_rate: float
    congestion_index: float
    safety_status: str

# Instantiate the vector store manager lazily to avoid loading at import
vector_manager = None

def get_vector_manager():
    global vector_manager
    if vector_manager is None:
        vector_manager = VectorStorageManager()
    return vector_manager

@app.post("/api/v1/operations/query", response_model=UnifiedResponse)
async def handle_operations_query(payload: OperationQuery):
    is_safe, sanitized_query = analyze_input_integrity(payload.query_text)
    if not is_safe:
        raise HTTPException(
            status_code=403, 
            detail="Forbidden: Input query failed system safety checks."
        )
        
    try:
        vm = get_vector_manager()
        context_docs = vm.retrieve_grounded_context(
            sanitized_query=sanitized_query,
            user_role=payload.user_role
        )
        
        if not context_docs:
            return UnifiedResponse(
                grounded_answer="No validated procedures match your request. Please contact zone supervision.",
                status="unresolved"
            )
            
        # Simulate local model execution incorporating the actual retrieved context
        simulated_response = f"Grounded response matching system context details. Protocol: {context_docs[0]}"
        return UnifiedResponse(grounded_answer=simulated_response, status="success")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal system error: {str(e)}") from e


@app.post("/api/v1/operations/calculate-congestion", response_model=CrowdMetricsResponse)
async def calculate_congestion(params: CrowdParameters):
    """
    Computes crowd safety metrics using the fluid dynamics framework:
    - Walking Velocity: v = v0 * (1 - a * rho)^4
    - Flow Rate: Q = rho * v * W
    - Congestion Index: C = w1 * ds + w2 * delta_v + w3 * alpha_d
    """
    v0 = 1.34  # Free-flow velocity (m/s)
    a = 0.28   # Structural footprint scaling factor
    
    # Calculate velocity: v = v0 * (1 - a * rho)^4 (bounded at 0)
    density_factor = 1.0 - (a * params.density)
    walking_velocity = v0 * (max(0.0, density_factor) ** 4)
    
    # Calculate flow rate: Q = rho * v * W
    flow_rate = params.density * walking_velocity * params.channel_width
    
    # Calculate normalized Congestion Index (C)
    # Normalize density: ds = density / 5.0 (capped at 1.0)
    ds = min(1.0, params.density / 5.0)
    # Normalize acoustic decibels: alpha_d = (acoustic_db - 30) / 90
    alpha_d = (params.acoustic_db - 30.0) / 90.0
    
    w1, w2, w3 = 0.4, 0.3, 0.3
    congestion_index = (w1 * ds) + (w2 * params.velocity_deviation) + (w3 * alpha_d)
    congestion_index = min(1.0, max(0.0, congestion_index))
    
    if congestion_index >= 0.7:
        safety_status = "CRITICAL"
    elif congestion_index >= 0.4:
        safety_status = "WARNING"
    else:
        safety_status = "SAFE"
        
    return CrowdMetricsResponse(
        walking_velocity=round(walking_velocity, 2),
        flow_rate=round(flow_rate, 2),
        congestion_index=round(congestion_index, 2),
        safety_status=safety_status
    )

@app.get("/healthz")
async def health_check():
    return {"status": "operational"}
