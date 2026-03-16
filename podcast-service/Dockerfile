# CUDA base image for XTTS v2 GPU acceleration
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

WORKDIR /app

# Install Python and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3-pip \
    ffmpeg \
    wget \
    curl \
    espeak-ng \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# Create directories
RUN mkdir -p /app/voices/piper /app/voices/samples /app/uploads /app/outputs

# Download Piper German voice (fallback)
RUN wget -q -O /app/voices/piper/de_DE-thorsten-high.onnx \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx" && \
    wget -q -O /app/voices/piper/de_DE-thorsten-high.onnx.json \
    "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx.json"

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Note: Voice samples are mounted via docker-compose volume in production

# Environment
ENV PIPER_VOICES_DIR=/app/voices/piper
ENV XTTS_SAMPLES_DIR=/app/voices/samples
ENV OLLAMA_HOST=http://ollama:11434
ENV OLLAMA_MODEL=qwen2.5:14b
ENV TTS_ENGINE=xtts
ENV COQUI_TOS_AGREED=1

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
