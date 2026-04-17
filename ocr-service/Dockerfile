FROM python:3.11-slim

WORKDIR /app

# System dependencies for EasyOCR (OpenCV, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download EasyOCR models at build time (avoids download at runtime)
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False, verbose=True)"

COPY app.py .

EXPOSE 5000

# Single gunicorn worker — processes one image at a time, caps memory usage
# 300s timeout to handle slow swap-based processing
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--timeout", "300", "app:app"]
