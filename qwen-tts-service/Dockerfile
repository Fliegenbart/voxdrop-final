# CUDA base image for Qwen3-TTS GPU acceleration
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

WORKDIR /app

# Install Python and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-dev \
    python3-pip \
    ffmpeg \
    curl \
    libsndfile1 \
    sox \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

ENV QWEN_TTS_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice
ENV QWEN_TTS_CLONE_ENABLED=false
ENV QWEN_TTS_FALLBACK_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-Base
ENV QWEN_TTS_FALLBACK_CLONE_ENABLED=true
ENV QWEN_TTS_LANGUAGE=german
ENV QWEN_TTS_DEVICE=cuda:0
ENV QWEN_TTS_DTYPE=bfloat16
ENV QWEN_TTS_SPEAKER_MALE=ryan
ENV QWEN_TTS_SPEAKER_FEMALE=serena
ENV QWEN_TTS_ALLOW_CPU=false

EXPOSE 8004

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8004"]
