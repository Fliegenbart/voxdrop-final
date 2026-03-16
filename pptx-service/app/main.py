"""
PPTX Accessibility Summary Service - FastAPI Entry Point
Converts PPTX to accessibility summaries using local LLM (Ollama).
"""
import os
import json
import uuid
import subprocess
import sys
from datetime import datetime
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
import httpx
import jsonschema

# Import our new modules
from app.pptx_generate_alttexts import generate_alttexts_async
from app.pptx_inject_alttexts import inject_alttexts
from app.pptx_to_pdf import convert_to_pdf
from app.pptx_to_accessible_html import generate_accessible_html
from app.pptx_to_summary_pdf import generate_summary_pdf_async
from app.qa import run_alttext_qa

# Configuration
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
UPLOAD_DIR = Path("/data/uploads")
JOBS_DIR = Path("/data/jobs")
OUTPUT_DIR = Path("/data/output")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:14b")
VLM_HOST = os.getenv("VLM_HOST", "http://vllm-vision:8000/v1")
VLM_MODEL = os.getenv("VLM_MODEL", "Qwen/Qwen3-VL-8B-Instruct-FP8")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "vllm").lower()  # vllm|ollama
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "100"))

# Create directories
for directory in [UPLOAD_DIR, JOBS_DIR, OUTPUT_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# In-memory job storage
jobs: Dict[str, Dict[str, Any]] = {}

# Load schema
SCHEMA_PATH = Path(__file__).parent / "voxdrop_accessibility_summary_schema_v01.json"
with open(SCHEMA_PATH) as f:
    SUMMARY_SCHEMA = json.load(f)

SYSTEM_PROMPT = """Du bist ein Experte für Barrierefreiheit und Dokumentenanalyse.
Analysiere die PowerPoint-Präsentation und erstelle eine strukturierte Zusammenfassung.

Antworte NUR mit einem JSON-Objekt. EXAKT diese Struktur verwenden:

{
  "schema_version": "0.1",
  "slide_index": 0,
  "language": "de",
  "global_summary_short": {
    "text": "Zusammenfassung in 20-420 Zeichen",
    "evidence_shape_ids": ["1", "2"]
  },
  "timeline": [
    {
      "year_or_phase": "2025",
      "headline": "Überschrift max 180 Zeichen",
      "details": "Details max 600 Zeichen",
      "evidence_shape_ids": ["3"]
    }
  ],
  "glossary": [
    {
      "term": "Begriff",
      "meaning": "Bedeutung max 220 Zeichen",
      "certainty": "high",
      "evidence_shape_ids": ["4"]
    }
  ],
  "open_questions": [
    {
      "question": "Offene Frage aus der Präsentation?",
      "evidence_shape_ids": ["5"]
    }
  ],
  "quality_flags": [
    {
      "code": "DENSE_LAYOUT",
      "message": "Folie 3 enthält sehr viele Elemente, Lesereihenfolge unklar"
    }
  ]
}

STRENGE REGELN:
- "schema_version" MUSS "0.1" sein
- "slide_index" MUSS 0 sein
- "language" MUSS "de" oder "en" sein
- "certainty" MUSS "high", "medium", "low" oder "unknown" sein
- JEDES Element in timeline, glossary, open_questions MUSS "evidence_shape_ids" haben!
- "evidence_shape_ids" ist PFLICHT und IMMER ein Array von Strings: ["1", "14", "23"]
- Falls keine timeline/glossary/open_questions vorhanden: leere Arrays [] verwenden
- "quality_flags" ist ein Array von OBJEKTEN mit "code" und "message", NICHT nur Strings!
- Wenn keine Probleme: "quality_flags": []
- Mögliche codes: DENSE_LAYOUT, IMAGE_ONLY_SUSPECTED, MISSING_CHART_DATA, READING_ORDER_LOW_CONFIDENCE, ABBREVIATIONS_UNRESOLVED, POSSIBLE_HALLUCINATION_RISK
- KEINE zusätzlichen Felder hinzufügen!
- KEINE Felder weglassen! Alle gezeigten Felder sind Pflicht!"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    print(f"[PPTX-Summary] Starting PPTX Accessibility Summary Service...")
    print(f"[PPTX-Summary] Ollama URL: {OLLAMA_URL}")
    print(f"[PPTX-Summary] LLM Model: {LLM_MODEL}")
    yield
    print("[PPTX-Summary] Shutting down PPTX Accessibility Summary Service...")


app = FastAPI(
    title="VoxDrop PPTX Summary Service",
    description="Converts PPTX to accessibility summaries using local LLM",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Models
class ConvertResponse(BaseModel):
    job_id: str
    status: str
    message: str


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: Optional[dict] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


# Health Check
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    # Check Ollama
    ollama_available = False
    ollama_models = []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            if resp.status_code == 200:
                ollama_available = True
                ollama_models = [m["name"] for m in resp.json().get("models", [])]
    except Exception:
        pass

    return {
        "status": "healthy" if ollama_available else "degraded",
        "ollama": {
            "available": ollama_available,
            "url": OLLAMA_URL,
            "model": LLM_MODEL,
            "models_loaded": ollama_models,
        },
        "config": {
            "max_file_size_mb": MAX_FILE_SIZE_MB,
        },
    }


def run_pipeline(job_id: str, pptx_path: Path, job_dir: Path) -> Path:
    """Run the 3-step pipeline: IR -> Semantic -> Modelpack"""
    update_job_progress(job_id, "pipeline", 0, "Extracting content from PPTX...")

    ir_path = job_dir / f"{job_id}.ir.json"
    semantic_path = job_dir / f"{job_id}.semantic.json"
    modelpack_path = job_dir / f"{job_id}.modelpack.json"

    app_dir = Path(__file__).parent

    # Step 1: Extract IR (33%)
    subprocess.run(
        [sys.executable, str(app_dir / "pptx_extract_ir.py"), str(pptx_path), "-o", str(ir_path)],
        check=True,
        capture_output=True,
    )
    update_job_progress(job_id, "pipeline", 33, "Analyzing semantic structure...")

    # Step 2: Semantic analysis (66%)
    subprocess.run(
        [sys.executable, str(app_dir / "pptx_semantic_pack.py"), str(ir_path), "-o", str(semantic_path)],
        check=True,
        capture_output=True,
    )
    update_job_progress(job_id, "pipeline", 66, "Creating model pack...")

    # Step 3: Create modelpack (100%)
    subprocess.run(
        [sys.executable, str(app_dir / "pptx_pack_minimizer.py"), str(ir_path), str(semantic_path), "-o", str(modelpack_path)],
        check=True,
        capture_output=True,
    )
    update_job_progress(job_id, "pipeline", 100, "Pipeline complete")

    return modelpack_path


def repair_llm_output(data: dict) -> dict:
    """
    Repair common LLM output errors to match the schema.
    Adds missing required fields with sensible defaults.
    """
    # Ensure required top-level fields
    data.setdefault("schema_version", "0.1")
    data.setdefault("slide_index", 0)
    data.setdefault("language", "de")

    # Ensure global_summary_short exists and has required fields
    if "global_summary_short" not in data:
        data["global_summary_short"] = {
            "text": "Zusammenfassung nicht verfügbar",
            "evidence_shape_ids": ["1"]
        }
    else:
        data["global_summary_short"].setdefault("evidence_shape_ids", ["1"])

    # Ensure arrays exist
    data.setdefault("timeline", [])
    data.setdefault("glossary", [])
    data.setdefault("open_questions", [])
    data.setdefault("quality_flags", [])

    # Repair timeline items
    for item in data.get("timeline", []):
        item.setdefault("evidence_shape_ids", ["1"])
        item.setdefault("year_or_phase", "unbekannt")
        item.setdefault("headline", "")
        item.setdefault("details", "")

    # Repair glossary items
    for item in data.get("glossary", []):
        item.setdefault("evidence_shape_ids", ["1"])
        item.setdefault("term", "")
        item.setdefault("meaning", "")
        item.setdefault("certainty", "unknown")
        # Fix invalid certainty values
        if item["certainty"] not in ["high", "medium", "low", "unknown"]:
            item["certainty"] = "unknown"

    # Repair open_questions items
    for item in data.get("open_questions", []):
        item.setdefault("evidence_shape_ids", ["1"])
        item.setdefault("question", "")

    # Repair quality_flags - convert strings to objects
    repaired_flags = []
    for flag in data.get("quality_flags", []):
        if isinstance(flag, str):
            # Convert string to object format
            repaired_flags.append({
                "code": flag if flag in [
                    "DENSE_LAYOUT", "IMAGE_ONLY_SUSPECTED", "MISSING_CHART_DATA",
                    "READING_ORDER_LOW_CONFIDENCE", "ABBREVIATIONS_UNRESOLVED",
                    "POSSIBLE_HALLUCINATION_RISK"
                ] else "POSSIBLE_HALLUCINATION_RISK",
                "message": f"Automatisch erkannt: {flag}"
            })
        elif isinstance(flag, dict):
            flag.setdefault("code", "POSSIBLE_HALLUCINATION_RISK")
            flag.setdefault("message", "Qualitätsproblem erkannt")
            repaired_flags.append(flag)
    data["quality_flags"] = repaired_flags

    return data


async def _vllm_generate(prompt: str, system: str = None, max_tokens: int = 4096) -> str:
    """Call vLLM OpenAI-compatible API for text generation."""
    host = VLM_HOST.rstrip("/")
    if not host.endswith("/v1"):
        host = f"{host}/v1"
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.post(
            f"{host}/chat/completions",
            json={
                "model": VLM_MODEL,
                "messages": messages,
                "temperature": 0.2,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
    data = response.json()
    return (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()


async def _ollama_generate(prompt: str, system: str = None, num_ctx: int = 16384) -> str:
    """Call Ollama /api/generate for text generation."""
    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": LLM_MODEL,
                "prompt": prompt,
                "system": system or "",
                "stream": False,
                "format": "json",
                "options": {"num_ctx": num_ctx},
            },
        )
        response.raise_for_status()
    return response.json().get("response", "")


async def _llm_generate(prompt: str, system: str = None, max_tokens: int = 4096) -> str:
    """Unified LLM wrapper: vLLM preferred, Ollama fallback."""
    if LLM_PROVIDER == "ollama":
        return await _ollama_generate(prompt, system=system)
    try:
        return await _vllm_generate(prompt, system=system, max_tokens=max_tokens)
    except Exception as e:
        print(f"[PPTX] vLLM failed, falling back to Ollama: {e}")
        return await _ollama_generate(prompt, system=system)


async def generate_summary(job_id: str, modelpack_path: Path) -> dict:
    """Send modelpack to LLM and get accessibility summary."""
    update_job_progress(job_id, "llm", 0, "Sending to LLM for analysis...")

    with open(modelpack_path) as f:
        modelpack = json.load(f)

    prompt = f"""Hier ist die Präsentation im Modelpack-Format:

{json.dumps(modelpack, ensure_ascii=False, indent=2)}

Erstelle jetzt die Accessibility-Summary als JSON."""

    llm_output = await _llm_generate(prompt, system=SYSTEM_PROMPT)

    update_job_progress(job_id, "llm", 80, "Validating response...")

    # Parse JSON from LLM output
    summary = json.loads(llm_output)

    # Repair common LLM output errors
    summary = repair_llm_output(summary)

    # Validate against schema
    jsonschema.validate(summary, SUMMARY_SCHEMA)

    update_job_progress(job_id, "llm", 100, "Summary complete")

    return summary


def update_job_progress(job_id: str, phase: str, percent: int, message: str):
    """Update job progress."""
    if job_id in jobs:
        jobs[job_id]["progress"] = {
            "phase": phase,
            "percent": percent,
            "message": message,
        }


async def process_job(job_id: str, pptx_path: Path):
    """Background task to process a PPTX file."""
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Run pipeline
        modelpack_path = run_pipeline(job_id, pptx_path, job_dir)

        # Generate summary with LLM
        summary = await generate_summary(job_id, modelpack_path)

        # Save result
        result_path = OUTPUT_DIR / f"{job_id}.json"
        with open(result_path, "w") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = {
            "summary": summary,
            "slides_processed": len(summary.get("slides", [])) if "slides" in summary else None,
        }
        jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()

    except json.JSONDecodeError as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = f"LLM returned invalid JSON: {str(e)}"
    except jsonschema.ValidationError as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = f"Schema validation failed: {str(e)}"
    except subprocess.CalledProcessError as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = f"Pipeline error: {e.stderr.decode() if e.stderr else str(e)}"
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)


@app.post("/convert", response_model=ConvertResponse)
async def convert_pptx(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload a PPTX file for accessibility summary generation."""
    # Validate file type
    if not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only .pptx files are allowed")

    # Check file size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
        )

    # Create job
    job_id = str(uuid.uuid4())
    pptx_path = UPLOAD_DIR / f"{job_id}.pptx"

    # Save file
    with open(pptx_path, "wb") as f:
        f.write(content)

    # Initialize job
    jobs[job_id] = {
        "job_id": job_id,
        "status": "processing",
        "progress": {"phase": "upload", "percent": 0, "message": "File received"},
        "created_at": datetime.utcnow().isoformat(),
        "filename": file.filename,
    }

    # Start processing
    background_tasks.add_task(process_job, job_id, pptx_path)

    return ConvertResponse(
        job_id=job_id,
        status="processing",
        message="PPTX conversion started"
    )


@app.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """Get the status of a conversion job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    return JobStatus(
        job_id=job_id,
        status=job["status"],
        progress=job.get("progress"),
        result=job.get("result"),
        error=job.get("error"),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
    )


@app.get("/jobs/{job_id}/download")
async def download_result(job_id: str):
    """Download the summary JSON for a completed job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job not completed. Current status: {job['status']}"
        )

    result_path = OUTPUT_DIR / f"{job_id}.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Result file not found")

    with open(result_path) as f:
        return JSONResponse(content=json.load(f))


# ============================================
# PDF Conversion with semantic alt-texts
# ============================================

async def process_pdf_job(job_id: str, pptx_path: Path):
    """Background task to convert PPTX to accessible PDF."""
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Phase 1: Run pipeline (30%)
        update_job_progress(job_id, "pipeline", 0, "Running semantic pipeline...")
        modelpack_path = run_pipeline(job_id, pptx_path, job_dir)

        # Phase 2: Generate alt-texts (50%)
        update_job_progress(job_id, "alttext", 30, "Generating alt-texts with LLM...")

        with open(modelpack_path) as f:
            modelpack = json.load(f)

        alttexts = await generate_alttexts_async(modelpack)
        update_job_progress(job_id, "alttext", 50, f"Generated {len(alttexts)} alt-texts")

        # Phase 2.5: QA validation and improvement (60%)
        update_job_progress(job_id, "qa", 55, "Validating and improving alt-texts...")
        alttexts, qa_stats = run_alttext_qa(alttexts, modelpack)
        update_job_progress(job_id, "qa", 60, f"QA complete: {qa_stats.get('improved', 0)} improved")

        alttexts_path = job_dir / f"{job_id}.alttexts.json"
        with open(alttexts_path, "w") as f:
            json.dump({"alttexts": alttexts, "qa_stats": qa_stats}, f, ensure_ascii=False, indent=2)

        # Phase 3: Inject alt-texts into PPTX (75%)
        update_job_progress(job_id, "inject", 65, "Injecting alt-texts into PPTX...")

        enhanced_pptx = job_dir / f"{job_id}_enhanced.pptx"
        inject_stats = inject_alttexts(str(pptx_path), alttexts, str(enhanced_pptx))

        update_job_progress(job_id, "inject", 75, f"Applied {inject_stats['alttexts_applied']} alt-texts")

        # Phase 4: Convert to PDF (100%)
        update_job_progress(job_id, "pdf", 80, "Converting to PDF...")

        pdf_path = OUTPUT_DIR / f"{job_id}.pdf"
        convert_to_pdf(str(enhanced_pptx), str(pdf_path))

        update_job_progress(job_id, "complete", 100, "PDF ready for download")

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = {
            "pdf_path": str(pdf_path),
            "alttexts_count": len(alttexts),
            "alttexts_applied": inject_stats["alttexts_applied"],
            "slides_processed": inject_stats["slides_processed"],
            "qa_stats": qa_stats,
        }
        jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()

    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)


@app.post("/convert-to-pdf", response_model=ConvertResponse)
async def convert_pptx_to_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Upload a PPTX file for conversion to accessible PDF.

    This uses the semantic pipeline to understand the presentation context,
    then generates intelligent alt-texts for all shapes, injects them into
    the PPTX, and converts to PDF.
    """
    # Validate file type
    if not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only .pptx files are allowed")

    # Check file size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
        )

    # Create job
    job_id = str(uuid.uuid4())
    pptx_path = UPLOAD_DIR / f"{job_id}.pptx"

    # Save file
    with open(pptx_path, "wb") as f:
        f.write(content)

    # Initialize job
    jobs[job_id] = {
        "job_id": job_id,
        "job_type": "pdf",
        "status": "processing",
        "progress": {"phase": "upload", "percent": 0, "message": "File received"},
        "created_at": datetime.utcnow().isoformat(),
        "filename": file.filename,
    }

    # Start processing
    background_tasks.add_task(process_pdf_job, job_id, pptx_path)

    return ConvertResponse(
        job_id=job_id,
        status="processing",
        message="PDF conversion started"
    )


@app.get("/jobs/{job_id}/download-pdf")
async def download_pdf(job_id: str):
    """Download the generated PDF for a completed job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job not completed. Current status: {job['status']}"
        )

    if job.get("job_type") != "pdf":
        raise HTTPException(status_code=400, detail="This job is not a PDF conversion")

    pdf_path = OUTPUT_DIR / f"{job_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")

    # Get original filename for download
    original_name = job.get("filename", "document.pptx")
    pdf_name = original_name.rsplit(".", 1)[0] + "_accessible.pdf"

    return FileResponse(
        path=str(pdf_path),
        filename=pdf_name,
        media_type="application/pdf"
    )


# ============================================
# HTML Conversion with semantic alt-texts
# ============================================

async def process_html_job(job_id: str, pptx_path: Path):
    """Background task to convert PPTX to accessible HTML."""
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Phase 1: Run pipeline (30%)
        update_job_progress(job_id, "pipeline", 0, "Running semantic pipeline...")
        modelpack_path = run_pipeline(job_id, pptx_path, job_dir)

        # Phase 2: Generate alt-texts (60%)
        update_job_progress(job_id, "alttext", 30, "Generating alt-texts with LLM...")

        with open(modelpack_path) as f:
            modelpack = json.load(f)

        alttexts = await generate_alttexts_async(modelpack)
        update_job_progress(job_id, "alttext", 55, f"Generated {len(alttexts)} alt-texts")

        # Phase 2.5: QA validation and improvement (70%)
        update_job_progress(job_id, "qa", 60, "Validating and improving alt-texts...")
        alttexts, qa_stats = run_alttext_qa(alttexts, modelpack)
        update_job_progress(job_id, "qa", 70, f"QA complete: {qa_stats.get('improved', 0)} improved")

        alttexts_path = job_dir / f"{job_id}.alttexts.json"
        with open(alttexts_path, "w") as f:
            json.dump({"alttexts": alttexts, "qa_stats": qa_stats}, f, ensure_ascii=False, indent=2)

        # Phase 3: Generate accessible HTML (100%)
        update_job_progress(job_id, "html", 80, "Generating accessible HTML...")

        # Get presentation title from filename
        original_name = jobs[job_id].get("filename", "document.pptx")
        title = original_name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ")

        html_content = generate_accessible_html(
            modelpack=modelpack,
            alttexts=alttexts,
            presentation_title=title,
            language="de"
        )

        html_path = OUTPUT_DIR / f"{job_id}.html"
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        update_job_progress(job_id, "complete", 100, "HTML ready for download")

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = {
            "html_path": str(html_path),
            "alttexts_count": len(alttexts),
            "slides_count": len(modelpack.get("slides", [])),
            "qa_stats": qa_stats,
        }
        jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()

    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)


@app.post("/convert-to-html", response_model=ConvertResponse)
async def convert_pptx_to_html(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Upload a PPTX file for conversion to accessible HTML.

    This uses the semantic pipeline to understand the presentation context,
    then generates intelligent alt-texts for all shapes, and creates a
    fully accessible HTML document optimized for screen readers.
    """
    # Validate file type
    if not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only .pptx files are allowed")

    # Check file size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
        )

    # Create job
    job_id = str(uuid.uuid4())
    pptx_path = UPLOAD_DIR / f"{job_id}.pptx"

    # Save file
    with open(pptx_path, "wb") as f:
        f.write(content)

    # Initialize job
    jobs[job_id] = {
        "job_id": job_id,
        "job_type": "html",
        "status": "processing",
        "progress": {"phase": "upload", "percent": 0, "message": "File received"},
        "created_at": datetime.utcnow().isoformat(),
        "filename": file.filename,
    }

    # Start processing
    background_tasks.add_task(process_html_job, job_id, pptx_path)

    return ConvertResponse(
        job_id=job_id,
        status="processing",
        message="HTML conversion started"
    )


@app.get("/jobs/{job_id}/download-html")
async def download_html(job_id: str):
    """Download the generated HTML for a completed job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job not completed. Current status: {job['status']}"
        )

    if job.get("job_type") != "html":
        raise HTTPException(status_code=400, detail="This job is not an HTML conversion")

    html_path = OUTPUT_DIR / f"{job_id}.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="HTML file not found")

    # Get original filename for download
    original_name = job.get("filename", "document.pptx")
    html_name = original_name.rsplit(".", 1)[0] + "_accessible.html"

    return FileResponse(
        path=str(html_path),
        filename=html_name,
        media_type="text/html; charset=utf-8"
    )


# ============================================
# Summary PDF - LLM summarizes each slide
# ============================================

async def process_summary_pdf_job(job_id: str, pptx_path: Path):
    """Background task to convert PPTX to accessible summary PDF."""
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Phase 1: Run pipeline (30%)
        update_job_progress(job_id, "pipeline", 0, "Running semantic pipeline...")
        modelpack_path = run_pipeline(job_id, pptx_path, job_dir)

        # Phase 2: Generate alt-texts (45%)
        update_job_progress(job_id, "alttext", 30, "Generating alt-texts with LLM...")

        with open(modelpack_path) as f:
            modelpack = json.load(f)

        alttexts = await generate_alttexts_async(modelpack)
        update_job_progress(job_id, "alttext", 45, f"Generated {len(alttexts)} alt-texts")

        # Phase 2.5: QA validation and improvement (55%)
        update_job_progress(job_id, "qa", 50, "Validating and improving alt-texts...")
        alttexts, qa_stats = run_alttext_qa(alttexts, modelpack)
        update_job_progress(job_id, "qa", 55, f"QA complete: {qa_stats.get('improved', 0)} improved")

        alttexts_path = job_dir / f"{job_id}.alttexts.json"
        with open(alttexts_path, "w") as f:
            json.dump({"alttexts": alttexts, "qa_stats": qa_stats}, f, ensure_ascii=False, indent=2)

        # Phase 3: Generate summaries and PDF (100%)
        update_job_progress(job_id, "summary", 60, "LLM summarizes each slide...")

        # Get presentation title from filename
        original_name = jobs[job_id].get("filename", "document.pptx")
        title = original_name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ")

        pdf_path = OUTPUT_DIR / f"{job_id}_summary.pdf"

        stats = await generate_summary_pdf_async(
            modelpack=modelpack,
            alttexts=alttexts,
            output_path=str(pdf_path),
            presentation_title=title,
            language="de"
        )

        update_job_progress(job_id, "complete", 100, "Summary PDF ready for download")

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = {
            "pdf_path": str(pdf_path),
            "slides_summarized": stats["slides_summarized"],
            "alttexts_count": len(alttexts),
            "qa_stats": qa_stats,
        }
        jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()

    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)


@app.post("/convert-to-summary-pdf", response_model=ConvertResponse)
async def convert_pptx_to_summary_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Upload a PPTX file for conversion to accessible summary PDF.

    This uses the semantic pipeline to understand the presentation context,
    generates alt-texts, then uses an LLM to create a human-readable
    summary of each slide. The output is a clean, accessible PDF.
    """
    # Validate file type
    if not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only .pptx files are allowed")

    # Check file size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE_MB}MB"
        )

    # Create job
    job_id = str(uuid.uuid4())
    pptx_path = UPLOAD_DIR / f"{job_id}.pptx"

    # Save file
    with open(pptx_path, "wb") as f:
        f.write(content)

    # Initialize job
    jobs[job_id] = {
        "job_id": job_id,
        "job_type": "summary_pdf",
        "status": "processing",
        "progress": {"phase": "upload", "percent": 0, "message": "File received"},
        "created_at": datetime.utcnow().isoformat(),
        "filename": file.filename,
    }

    # Start processing
    background_tasks.add_task(process_summary_pdf_job, job_id, pptx_path)

    return ConvertResponse(
        job_id=job_id,
        status="processing",
        message="Summary PDF conversion started"
    )


@app.get("/jobs/{job_id}/download-summary-pdf")
async def download_summary_pdf(job_id: str):
    """Download the generated summary PDF for a completed job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job not completed. Current status: {job['status']}"
        )

    if job.get("job_type") != "summary_pdf":
        raise HTTPException(status_code=400, detail="This job is not a summary PDF conversion")

    pdf_path = OUTPUT_DIR / f"{job_id}_summary.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")

    # Get original filename for download
    original_name = job.get("filename", "document.pptx")
    pdf_name = original_name.rsplit(".", 1)[0] + "_zusammenfassung.pdf"

    return FileResponse(
        path=str(pdf_path),
        filename=pdf_name,
        media_type="application/pdf"
    )
