FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3-pip \
    python3.11-venv \
    build-essential \
    ffmpeg \
    curl \
    libsndfile1 \
    libgl1 \
    libglib2.0-0 \
    sox \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1
RUN ln -sf /usr/bin/python3.11 /usr/bin/python

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip3 install --no-cache-dir numpy==1.23.4 typing_extensions \
    && pip3 install --no-cache-dir -r requirements.txt

COPY main.py ./main.py
COPY avatars ./avatars
COPY sitecustomize.py /usr/local/lib/python3.11/dist-packages/sitecustomize.py

ENV PYTHONUNBUFFERED=1
ENV AVATAR_DIR=/app/avatars
ENV AVATAR_OUTPUT_DIR=/app/outputs
ENV AVATAR_VOICES_DIR=/app/voices/samples
ENV SADTALKER_DIR=/opt/SadTalker

EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8005/api/health || exit 1

CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8005"]
