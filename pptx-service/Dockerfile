FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
# - curl: healthcheck
# - LibreOffice: PPTX to PDF conversion
# - WeasyPrint deps: pango, cairo, fonts for PDF generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libreoffice-impress \
    libreoffice-common \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    fonts-dejavu-core \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app/ /app/app/

# Create data directories
RUN mkdir -p /data/uploads /data/jobs /data/output

EXPOSE 8003

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]
