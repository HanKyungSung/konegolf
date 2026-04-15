"""
EasyOCR Flask Service — Receipt text extraction via REST API.

Endpoints:
  POST /ocr  — accepts image (multipart), returns detected text lines
  GET /health — service status, model loaded, memory usage
"""

import io
import os
import time
import resource

from flask import Flask, request, jsonify

app = Flask(__name__)

# Global reader — loaded once at startup, reused across requests
_reader = None
_start_time = time.time()


def get_reader():
    """Lazy-load EasyOCR reader on first request."""
    global _reader
    if _reader is None:
        import easyocr
        app.logger.info("Loading EasyOCR reader (this takes ~5-10s)...")
        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        app.logger.info("EasyOCR reader loaded.")
    return _reader


@app.route("/health", methods=["GET"])
def health():
    mem_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    # On Linux, ru_maxrss is in KB; on macOS it's in bytes
    if os.uname().sysname == "Linux":
        mem_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    else:
        mem_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024)

    return jsonify({
        "status": "ok",
        "modelLoaded": _reader is not None,
        "memoryMB": round(mem_mb, 1),
        "uptimeSeconds": round(time.time() - _start_time, 1),
    })


@app.route("/ocr", methods=["POST"])
def ocr():
    if "image" not in request.files:
        return jsonify({"error": "No image file provided. Use multipart field 'image'."}), 400

    file = request.files["image"]
    if not file.filename:
        return jsonify({"error": "Empty filename."}), 400

    try:
        image_bytes = file.read()
        if len(image_bytes) == 0:
            return jsonify({"error": "Empty image file."}), 400

        reader = get_reader()

        t0 = time.time()
        results = reader.readtext(io.BytesIO(image_bytes).read())
        elapsed = time.time() - t0

        # Sort by vertical position (top to bottom)
        results.sort(key=lambda x: x[0][0][1])

        lines = []
        for bbox, text, confidence in results:
            lines.append({
                "text": text,
                "confidence": round(confidence, 4),
            })

        app.logger.info(
            "OCR complete: %d text regions in %.1fs", len(lines), elapsed
        )

        return jsonify({
            "lines": lines,
            "processingTimeMs": round(elapsed * 1000),
            "regionCount": len(lines),
        })

    except Exception as e:
        app.logger.error("OCR failed: %s", str(e))
        return jsonify({"error": f"OCR processing failed: {str(e)}"}), 500


@app.route("/warmup", methods=["POST"])
def warmup():
    """Pre-load the EasyOCR model without processing an image."""
    get_reader()
    return jsonify({"status": "model loaded"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
