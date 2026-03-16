import os
import shutil
import subprocess
import tempfile
import uuid
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pypdf import PdfReader
from starlette.background import BackgroundTask

APP_MAX_MB = int(os.getenv("DOCX_MAX_FILE_SIZE_MB", "100"))
CONVERT_TIMEOUT_S = int(os.getenv("DOCX_CONVERT_TIMEOUT_SECONDS", "120"))
MAX_CONCURRENCY = max(1, int(os.getenv("DOCX_MAX_CONCURRENCY", "1")))

app = FastAPI(
    title="VoxDrop DOCX Service",
    description="Convert Word documents (DOCX/DOC) to PDF for downstream PDF/UA processing.",
    version="1.0.0",
)


def _safe_filename(name: str) -> str:
    # Keep it simple: only used for temp paths.
    return "".join(ch for ch in (name or "") if ch.isalnum() or ch in ("-", "_", ".", " ")).strip() or "document"


def _file_ext(name: str) -> str:
    lowered = (name or "").lower()
    if lowered.endswith(".docx"):
        return ".docx"
    if lowered.endswith(".doc"):
        return ".doc"
    return ""


def _count_pdf_pages(path: str) -> int:
    reader = PdfReader(path)
    return len(reader.pages)


_semaphore = None


@app.on_event("startup")
def _startup():
    global _semaphore
    import asyncio

    _semaphore = asyncio.Semaphore(MAX_CONCURRENCY)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/convert-to-pdf")
async def convert_to_pdf(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    ext = _file_ext(file.filename)
    if ext not in (".docx", ".doc"):
        raise HTTPException(status_code=400, detail="Only DOCX/DOC supported")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    size_mb = len(content) / (1024 * 1024)
    if size_mb > APP_MAX_MB:
        raise HTTPException(status_code=400, detail=f"File too large: {size_mb:.1f}MB. Max: {APP_MAX_MB}MB")

    # Concurrency guard: LibreOffice conversions are heavy and not perfectly parallel-safe.
    if _semaphore is None:
        raise HTTPException(status_code=503, detail="Service not ready")

    import asyncio

    async with _semaphore:
        job_id = uuid.uuid4().hex
        base = _safe_filename(file.filename).rsplit(".", 1)[0]

        workdir = tempfile.mkdtemp(prefix=f"voxdrop-docx-{job_id}-")
        try:
            in_path = os.path.join(workdir, f"input{ext}")
            out_dir = os.path.join(workdir, "out")
            os.makedirs(out_dir, exist_ok=True)

            with open(in_path, "wb") as f:
                f.write(content)

            # Isolate profile to avoid lock-contention across conversions.
            profile_dir = os.path.join(workdir, "lo-profile")
            os.makedirs(profile_dir, exist_ok=True)
            profile_uri = f"file://{profile_dir}"

            cmd = [
                "soffice",
                "--headless",
                "--invisible",
                "--nologo",
                "--nofirststartwizard",
                "--norestore",
                "--nolockcheck",
                "--nodefault",
                "--nocrashreport",
                f"-env:UserInstallation={profile_uri}",
                "--convert-to",
                "pdf:writer_pdf_Export",
                "--outdir",
                out_dir,
                in_path,
            ]

            # Run conversion.
            try:
                subprocess.run(
                    cmd,
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=CONVERT_TIMEOUT_S,
                )
            except subprocess.TimeoutExpired:
                raise HTTPException(status_code=504, detail="DOCX conversion timed out")
            except subprocess.CalledProcessError as e:
                stderr = (e.stderr or b"").decode("utf-8", errors="ignore")
                stdout = (e.stdout or b"").decode("utf-8", errors="ignore")
                tail = "\n".join([stdout[-1000:], stderr[-2000:]]).strip()
                raise HTTPException(status_code=500, detail=("DOCX conversion failed" + (f": {tail}" if tail else "")))

            # LibreOffice writes "<basename>.pdf" into out_dir, but basename handling varies.
            produced_pdf: Optional[str] = None
            for name in os.listdir(out_dir):
                if name.lower().endswith(".pdf"):
                    produced_pdf = os.path.join(out_dir, name)
                    break
            if not produced_pdf or not os.path.exists(produced_pdf):
                raise HTTPException(status_code=500, detail="DOCX conversion produced no PDF")

            output_pdf = os.path.join(workdir, f"{base or 'document'}.pdf")
            shutil.move(produced_pdf, output_pdf)

            try:
                pages = _count_pdf_pages(output_pdf)
            except Exception:
                pages = 0

            # Cleanup after response is fully sent.
            resp = FileResponse(
                output_pdf,
                media_type="application/pdf",
                filename=f"{base or 'document'}.pdf",
                background=BackgroundTask(shutil.rmtree, workdir, ignore_errors=True),
            )
            if pages:
                resp.headers["x-page-count"] = str(pages)
            return resp
        except HTTPException:
            shutil.rmtree(workdir, ignore_errors=True)
            raise
        except Exception:
            shutil.rmtree(workdir, ignore_errors=True)
            raise
