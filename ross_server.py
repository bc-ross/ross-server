from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional

import ross_link
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator, Field

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev. For prod, list "moz-extension://<id>" etc.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.get("/favicon.ico", response_class=FileResponse, include_in_schema=False)
def serve_favicon() -> FileResponse:
    """Serve the SPA entrypoint."""
    index_path = os.path.join(STATIC_DIR, "favicon.ico")
    if not os.path.isfile(index_path):
        raise HTTPException(status_code=404, detail="static/favicon.ico not found")
    return FileResponse(index_path)

# -----------------------------
# Upload scraped course codes (placement and for-credit)
# -----------------------------

class UploadCoursesRequest(BaseModel):
    placement: list[str] = Field(default_factory=list)
    for_credit: list[str] = Field(default_factory=list)

class UploadCoursesResponse(BaseModel):
    placement: list[str]
    for_credit: list[str]
    message: str

@app.post("/api/upload_courses", response_model=UploadCoursesResponse)
async def upload_courses(req: UploadCoursesRequest) -> UploadCoursesResponse:

    # Here you could save to a database, session, etc. For now, just echo back.
    print(f"Placement: {req.placement}\nFor-credit: {req.for_credit}")
    return UploadCoursesResponse(
        placement=req.placement,
        for_credit=req.for_credit,
        message="Course lists received successfully."
    )

# -----------------------------
# Debug endpoint for extension
# -----------------------------
# This will print and return the lists for debugging
from fastapi import Query

@app.get("/api/debug_info")
async def get_debug_info(
    placement: list[str] = Query(default=[]),
    for_credit: list[str] = Query(default=[]),
    sorted_order: list[str] = Query(default=[]),
    detailed_listing: list[str] = Query(default=[])
):
    import re, json
    semester_courses = {}
    no_credit_courses = {}
    semester_count = 1
    summer_count = 1
    semester_numbers = {}
    # Assign numbers to semesters in chronological order
    for sem in sorted_order:
        if sem != 'Non-term':
            if re.search(r'Summer', sem, re.I):
                semester_numbers[sem] = f"summer-{summer_count}"
                summer_count += 1
            else:
                semester_numbers[sem] = f"semester-{semester_count}"
                semester_count += 1
    # Parse detailed_listing: expects list of JSON strings
    for entry in detailed_listing:
        try:
            obj = json.loads(entry)
        except Exception:
            continue
        semester = obj.get('semester', 'Non-term')
        courses = obj.get('courses', []) if isinstance(obj.get('courses', None), list) else [obj.get('text', '')]
        for course in courses:
            match = re.match(r'([A-Z]+)-(\d+)\s+\((.+?)\)', course)
            if match:
                dept, num, credits = match.groups()
                course_entry = f"{dept}-{int(num)}"
                if semester == 'Non-term' or credits == 'Placement' or credits == '?':
                    no_credit_courses.setdefault('non-term', []).append(course_entry)
                else:
                    sem_key = semester_numbers.get(semester)
                    if sem_key:
                        semester_courses.setdefault(sem_key, []).append(course_entry)
    # Format output
    output = 'Courses with Credits:\n{\n'
    sorted_semesters = sorted(semester_courses.items(), key=lambda x: int(x[0].split('-')[1]))
    for semester, courses in sorted_semesters:
        output += f'    "{semester}": {json.dumps(courses)},\n'
    # Append 'Courses without Credits' to the end of the main list
    for semester, courses in no_credit_courses.items():
        output += f'    "{semester}": {json.dumps(courses)},\n'
    if sorted_semesters or no_credit_courses:
        output = output[:-2]  # Remove last comma
    output += '\n}'
    print("\n================ DEBUG INFO ================\n")
    print(output)
    print("\n============================================\n")
    return {"placement": placement, "for_credit": for_credit}

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
    reasons: Optional[dict[str, list[dict[str, str]]]] = None
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

    schedule = ross_link.Schedule(req.majors, req.courses_taken)
    schedule.validate()
    semesters = schedule.get_courses()
    reasons = schedule.get_reasons()

    return ScheduleResponse(
        message="Schedule sucessfully created!",
        majors=req.majors,
        courses_taken=req.courses_taken,
        semesters=semesters,  # <-- key bit
        reasons=reasons,
        schedule_id=schedule_id,
    )



# -----------------------------
# Replacement courses endpoint
# -----------------------------
from fastapi import Body

class ReplacementRequest(BaseModel):
    reason: dict


# Return replacements in the same format as reasons list

class ReplacementResponse(BaseModel):
    courses: list[dict]

@app.post("/api/replacements", response_model=ReplacementResponse)
async def find_replacements(req: ReplacementRequest = Body(...)):
    reason = req.reason
    majors = [""]
    schedule = ross_link.Schedule(majors, [])
    all_alts = schedule.get_other_courses(
        getattr(ross_link.ReasonTypes, reason.get("type", None)),
        name=reason.get("name", None),
        prog=reason.get("prog", None)
    )
    # If get_other_courses returns a list of strings, wrap each as a dict
    if all_alts and isinstance(all_alts[0], str):
        all_alts = [{"course": c} for c in all_alts]
    return ReplacementResponse(courses=all_alts)
    # You may want to adjust how you get the schedule object

class MajorListResponse(BaseModel):
    items: List[str]


@app.get("/api/majors", response_model=MajorListResponse)
def get_majors():
    # assume Rust function returns a Python list of strings
    majors = ross_link.Schedule.get_programs()
    return MajorListResponse(items=majors)


## Removed unused code referencing undefined 'sched' and 'reason'.


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
