from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional

import ross_link
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

# -----------------------------
# INPUT RUST FUNCTIONS
# -----------------------------


# -----------------------------
# Logging
# -----------------------------
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
log = logging.getLogger("ross-server")

# -----------------------------
# FastAPI app
# -----------------------------
app = FastAPI(
    title="ROSS Server",
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
    allow_origins=["*"],  # For development convenience. Lock down in prod.
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
    semesters: Optional[Dict[str, list[tuple[str, str | int, Optional[int]]]]] = None
    schedule_id: Optional[str] = None


# -----------------------------
# Health check
# -----------------------------
@app.get("/health", summary="Health check")
def health() -> dict:
    return {"ok": True, "service": "ross-server", "version": "1.0.0"}


# -----------------------------
# Core endpoint
# -----------------------------
@app.post("/api/schedule", response_model=ScheduleResponse, summary="Create schedule")
async def make_schedule(req: ScheduleRequest, request: Request) -> ScheduleResponse:
    client = request.client.host if request.client else "unknown"
    log.info("POST /api from %s | majors=%s | courses=%s", client, req.majors, req.courses_taken)

    # Fake id for now
    schedule_id = "sched_" + str(abs(hash(tuple(req.majors) + tuple(req.courses_taken))))[:10]

    # >>> Mock semesters that your front-end will render
    semesters = ross_link.Schedule(req.majors, req.courses_taken).get_courses()
    print(semesters)

    return ScheduleResponse(
        message="Schedule sucessfully created!",
        majors=req.majors,
        courses_taken=req.courses_taken,
        semesters=semesters,  # <-- key bit
        schedule_id=schedule_id,
    )


class MajorListResponse(BaseModel):
    items: List[str]


@app.get("/api/majors", response_model=MajorListResponse)
def get_majors():
    # assume Rust function returns a Python list of strings
    majors = ross_link.Schedule.get_programs()
    return MajorListResponse(items=majors)


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

    uvicorn.run("ross_server:app", host="127.0.0.1", port=8000, reload=True)
