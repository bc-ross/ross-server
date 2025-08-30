from __future__ import annotations

import os
import logging
from typing import List, Optional

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
from typing import List, Optional, Dict, Union


# -----------------------------
# Logging
# -----------------------------
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
log = logging.getLogger("ross-backend")

# -----------------------------
# FastAPI app
# -----------------------------
app = FastAPI(
    title="ROSS Backend",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# -----------------------------
# CORS (relaxed for dev)
# Adjust allow_origins in prod.
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],         # For development convenience. Lock down in prod.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Static files (front-end)
# -----------------------------
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if not os.path.isdir(STATIC_DIR):
    os.makedirs(STATIC_DIR, exist_ok=True)
    log.warning("Created empty static/ directory. Put index.html inside it.")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/", response_class=FileResponse, include_in_schema=False)
def serve_index() -> FileResponse:
    """Serve the SPA entrypoint."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if not os.path.isfile(index_path):
        raise HTTPException(status_code=404, detail="static/index.html not found")
    return FileResponse(index_path)


# -----------------------------
# Models
# -----------------------------
class ScheduleRequest(BaseModel):
    majors: List[str]
    courses_taken: List[str]

    # Optional, but keeps inputs tidy
    @field_validator("majors", "courses_taken", mode="before")
    @classmethod
    def ensure_list(cls, v):
        if v is None:
            return []
        if isinstance(v, (list, tuple)):
            return list(v)
        raise ValueError("must be an array of strings")

    @field_validator("majors", "courses_taken")
    @classmethod
    def strip_items(cls, v: List[str]):
        return [s.strip() for s in v if isinstance(s, str) and s.strip()]


class ScheduleResponse(BaseModel):
    message: str
    majors: List[str]
    courses_taken: List[str]
    # New: object whose keys are "semester-1", "semester-2", ... each with rows like ["MATH","101",3,"Calculus I"]
    semesters: Optional[Dict[str, List[List[Union[str, int]]]]] = None
    schedule_id: Optional[str] = None



# -----------------------------
# Health check
# -----------------------------
@app.get("/health", summary="Health check")
def health() -> dict:
    return {"ok": True, "service": "ross-backend", "version": "1.0.0"}

def build_mock_semesters() -> Dict[str, List[List[Union[str, int]]]]:
    return {
        "semester-1": [
            ["MATH", "101", 3, "Calculus I"],
            ["CHEM", "110", 4, "General Chemistry I"],
            ["ENGL", "120", 3, "Composition"],
            ["THEO", "1100", 3, "Intro to Theology"],
            ["HIST", "150", 3, "World History I"],
        ],
        "semester-2": [
            ["MATH", "102", 3, "Calculus II"],
            ["CHEM", "120", 4, "General Chemistry II"],
            ["PHYS", "130", 4, "Physics I"],
            ["PHIL", "101", 3, "Intro to Philosophy"],
            ["ENGL", "200", 3, "Literature Survey"],
        ],
        "semester-3": [
            ["MATH", "201", 3, "Linear Algebra"],
            ["CHEM", "210", 4, "Organic Chemistry I"],
            ["PHYS", "140", 4, "Physics II"],
            ["CS", "101", 3, "Intro to Computer Science"],
            ["COMM", "105", 3, "Public Speaking"],
        ],
        "semester-4": [
            ["MATH", "202", 3, "Differential Equations"],
            ["CHEM", "220", 4, "Organic Chemistry II"],
            ["BIO", "210", 4, "Cell Biology"],
            ["THEO", "2000", 3, "Christian Moral Life"],
            ["ART", "110", 3, "Intro to Art"],
        ],
        "semester-5": [
            ["MATH", "301", 3, "Probability & Statistics"],
            ["CHEM", "310", 4, "Physical Chemistry I"],
            ["BIO", "220", 4, "Genetics"],
            ["PHIL", "210", 3, "Ethics"],
            ["ECON", "101", 3, "Principles of Economics"],
        ],
        "semester-6": [
            ["MATH", "302", 3, "Abstract Algebra"],
            ["CHEM", "320", 4, "Physical Chemistry II"],
            ["BIO", "330", 4, "Microbiology"],
            ["HIST", "250", 3, "American History"],
            ["PSYC", "101", 3, "Intro to Psychology"],
        ],
        "semester-7": [
            ["MATH", "401", 3, "Real Analysis"],
            ["CHEM", "410", 4, "Biochemistry I"],
            ["BIO", "410", 4, "Ecology"],
            ["THEO", "3000", 3, "Catholic Social Teaching"],
            ["PHIL", "310", 3, "Metaphysics"],
        ],
        "semester-8": [
            ["MATH", "402", 3, "Complex Analysis"],
            ["CHEM", "420", 4, "Biochemistry II"],
            ["BIO", "420", 4, "Molecular Biology"],
            ["CAPS", "499", 3, "Senior Capstone"],
            ["ELEC", "300", 3, "Free Elective"],
        ],
    }



# -----------------------------
# Core endpoint
# -----------------------------
@app.post("/api", response_model=ScheduleResponse, summary="Create schedule")
async def make_schedule(req: ScheduleRequest, request: Request) -> ScheduleResponse:
    client = request.client.host if request.client else "unknown"
    log.info("POST /api from %s | majors=%s | courses=%s", client, req.majors, req.courses_taken)

    # Fake id for now
    schedule_id = "sched_" + str(abs(hash(tuple(req.majors) + tuple(req.courses_taken))))[:10]

    # >>> Mock semesters that your front-end will render
    semesters = build_mock_semesters()

    return ScheduleResponse(
        message="Schedule sucessfully created!",
        majors=req.majors,
        courses_taken=req.courses_taken,
        semesters=semesters,           # <-- key bit
        schedule_id=schedule_id,
    )



# -----------------------------
# Error handlers (nice JSON)
# -----------------------------
@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    log.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("testing_schedule:app", host="127.0.0.1", port=8000, reload=True)

