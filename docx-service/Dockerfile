FROM python:3.12-slim

# LibreOffice for DOCX->PDF conversion.
# This is intentionally its own service to avoid bloating the main web image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-core \
    libreoffice-common \
    fonts-dejavu-core \
    fonts-liberation \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

ENV PORT=8006
EXPOSE 8006

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8006"]

