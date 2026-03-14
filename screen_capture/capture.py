"""
Konegolf Score Capture
- Runs in background on each bay PC
- Captures screen via DXGI every few seconds
- Detects COMPLETED scorecard screen, extracts player names + scores via OCR
- Saves screenshots and logs all results
"""

import time
import os
import sys
import json
import logging
import re
from datetime import datetime

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
CONFIG_FILE = "config.json"
SCRIPT_VERSION = open(os.path.join(os.path.dirname(__file__), "VERSION.txt")).read().strip()

def load_config():
    defaults = {
        "bay_number": 1,
        "pos_server_url": "",
        "ingest_secret": "",
        "capture_interval_seconds": 0.5,
        "ocr_language": ["en"],
        "log_file": "score_capture.log",
        "save_captures": True,
        "capture_save_dir": "captures",
        "cooldown_seconds": 120,
        "confidence_threshold": 0.7,
        # Detection region for "SCORE CARD" text (% of screen)
        "detect_region": {"x": 0.28, "y": 0.12, "w": 0.44, "h": 0.16},
        # Player name region — covers up to 4 player rows
        "name_region": {"x": 0.12, "y": 0.40, "w": 0.16, "h": 0.17},
        # Total score region — covers TOTAL column for up to 4 players
        "score_region": {"x": 0.68, "y": 0.40, "w": 0.10, "h": 0.17},
        # Course name region
        "course_region": {"x": 0.24, "y": 0.05, "w": 0.30, "h": 0.07},
    }
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            user_cfg = json.load(f)
            defaults.update(user_cfg)
    return defaults

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def setup_logging(log_file):
    logger = logging.getLogger("score_capture")
    logger.setLevel(logging.DEBUG)
    # File handler - detailed
    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(fh)
    # Console handler - minimal
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(ch)
    return logger

# ---------------------------------------------------------------------------
# Region crop helper
# ---------------------------------------------------------------------------
def crop_region(frame, region):
    """Crop frame using region dict with x, y, w, h as ratios (0.0 - 1.0)."""
    h, w = frame.shape[:2]
    x1 = int(region["x"] * w)
    y1 = int(region["y"] * h)
    x2 = int((region["x"] + region["w"]) * w)
    y2 = int((region["y"] + region["h"]) * h)
    return frame[y1:y2, x1:x2]


def ocr_read(ocr_engine, image, detail=False, log=None):
    """Unified OCR interface for PaddleOCR.
    image: numpy array (H, W, C)
    detail=False → returns list of text strings
    detail=True  → returns list of (bbox, text, confidence) matching EasyOCR format
    """
    try:
        results = ocr_engine.predict(image)
    except Exception as e:
        if log:
            log.debug(f"OCR predict exception: {e}")
        return [] if not detail else []

    if log:
        log.debug(f"OCR raw result type: {type(results)}, len: {len(results) if hasattr(results, '__len__') else 'N/A'}")
        for i, item in enumerate(results):
            log.debug(f"  item[{i}] type={type(item).__name__}, keys={list(item.keys()) if isinstance(item, dict) else 'N/A'}, attrs={[a for a in dir(item) if a.startswith('rec_')]}")

    texts, scores, polys = [], [], []
    for item in results:
        if isinstance(item, dict):
            texts = item.get("rec_texts", [])
            scores = item.get("rec_scores", [])
            polys = item.get("rec_polys", [])
        elif hasattr(item, "rec_texts"):
            texts = item.rec_texts
            scores = item.rec_scores
            polys = getattr(item, "rec_polys", [])

    if log:
        log.debug(f"OCR parsed texts: {texts}")

    if not detail:
        return texts

    # Convert to (bbox, text, confidence) tuples for parse functions
    out = []
    for i, (txt, score) in enumerate(zip(texts, scores)):
        bbox = polys[i].tolist() if i < len(polys) else [[0, 0], [0, 0], [0, 0], [0, 0]]
        out.append((bbox, txt, score))
    return out


# ---------------------------------------------------------------------------
# Color pre-filter: fast scorecard screen detection (~0ms)
# ---------------------------------------------------------------------------
# The scorecard has a distinctive dark gray background (≈45,48,55) in areas
# where game screens would show course content. Checking 5 pixel samples is
# nearly instant and avoids running OCR on every frame.
_PREFILTER_POINTS = [
    (0.50, 0.13),  # above "SCORE CARD" text, center
    (0.30, 0.13),  # above "SCORE CARD" text, left
    (0.70, 0.13),  # above "SCORE CARD" text, right
    (0.85, 0.30),  # right margin outside table
    (0.85, 0.40),  # right margin lower
]
_DARK_GRAY = (45, 48, 55)
_GRAY_TOLERANCE = 12


def scorecard_color_check(frame):
    """Fast check: does the frame look like a scorecard based on background color?
    Returns True if 4+ of 5 sample points match the scorecard's dark gray.
    """
    h, w = frame.shape[:2]
    matches = 0
    for x_pct, y_pct in _PREFILTER_POINTS:
        x, y = int(x_pct * w), int(y_pct * h)
        r, g, b = int(frame[y, x, 0]), int(frame[y, x, 1]), int(frame[y, x, 2])
        if (abs(r - _DARK_GRAY[0]) <= _GRAY_TOLERANCE and
                abs(g - _DARK_GRAY[1]) <= _GRAY_TOLERANCE and
                abs(b - _DARK_GRAY[2]) <= _GRAY_TOLERANCE):
            matches += 1
    return matches >= 4


NAME_SKIP_WORDS = {
    "HOLE",
    "PAR",
    "TOTAL",
    "HANDICAP",
    "OUT",
    "IN",
    "SCORE",
    "CARD",
    "MAUNA",
    "OCEAN",
    "MEADOW",
    "FOREST",
}

# Level badge prefixes from Golfzon (Amateur, Semi-pro, Pro, etc.)
LEVEL_BADGE_PATTERN = re.compile(r"^[AaSsBbPp]\s+(?=[A-Za-z가-힣])")


def is_name_like(text):
    return any(
        char.isalpha() or ("\uAC00" <= char <= "\uD7A3")
        for char in text
    )


def detect_stableford_icons(frame):
    """Check if pink Stableford 'S' badges are visible in the player name area.
    Samples pixels at x≈0.20 across player row y-positions.
    Returns True if at least one pink badge detected.
    """
    from PIL import Image
    h, w = frame.shape[:2]
    sample_x = int(0.20 * w)
    row_ys = [int(y * h) for y in [0.43, 0.47, 0.51, 0.55]]
    for y in row_ys:
        r, g, b = int(frame[y, sample_x, 0]), int(frame[y, sample_x, 1]), int(frame[y, sample_x, 2])
        if r > 200 and g < 120 and b > 100:
            return True
    return False


def parse_name_candidates(name_results, strip_icon=False, crop_height=None):
    """Parse name candidates from EasyOCR detail results.
    name_results: list of (bbox, text, confidence) tuples from readtext(detail=1)
    strip_icon: if True, remove leading I/S/s/5 artifacts from Stableford icon OCR
    crop_height: if provided, compute row_index (0-based) for each name based on y-position
    Returns list of (cleaned_name, confidence, row_index) tuples sorted by row.
    """
    names = []
    seen = set()

    for bbox, text, conf in name_results:
        raw = text.strip()
        if strip_icon:
            raw = re.sub(r"^[ISis5]\s*(?=[a-z])", "", raw)
        # Strip level badge prefix (e.g. "A h" → "h", "S kim" → "kim")
        raw = LEVEL_BADGE_PATTERN.sub("", raw)
        # Also handle merged badge+name like "Ah" → "h", "Ac" → "c"
        if len(raw) == 2 and raw[0] in "AaSsBbPp" and raw[1].isalpha():
            raw = raw[1:]
        cleaned = re.sub(r"[^0-9A-Za-z가-힣]+", "", raw)
        if cleaned.upper().startswith("SPLAYER"):
            cleaned = cleaned[1:]
        if not cleaned:
            continue
        if cleaned.upper() in NAME_SKIP_WORDS:
            continue
        # Skip standalone level badge / icon letters confirmed as OCR artifacts
        if len(cleaned) == 1 and cleaned.upper() in "AS":
            continue
        if not is_name_like(cleaned):
            continue

        # Compute row index from bbox y-center
        row_idx = 0
        if crop_height and crop_height > 0:
            # bbox = [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
            y_center = sum(pt[1] for pt in bbox) / len(bbox)
            row_height = crop_height / 4.0
            row_idx = min(int(y_center / row_height), 3)

        if cleaned not in seen:
            names.append((cleaned, round(conf, 3), row_idx))
            seen.add(cleaned)

    names.sort(key=lambda x: x[2])
    return names


def parse_score_candidates(score_results):
    """Parse score candidates from EasyOCR detail results.
    score_results: list of (bbox, text, confidence) tuples from readtext(detail=1)
    Returns list of (score_int, confidence) tuples — one per player row.
    """
    scores = []

    for bbox, text, conf in score_results:
        without_paren = re.sub(r"\([^)]*\)", " ", text)
        candidates = re.findall(r"\d{1,3}", without_paren)
        if not candidates:
            # If removing parens left nothing, the entire text was a delta like "(+15)" — skip
            continue
        line_scores = []
        for candidate in candidates:
            score = int(candidate)
            if 1 <= score <= 200:
                line_scores.append(score)
        if not line_scores:
            continue
        # Skip lines where the only score is exactly 72 (PAR row)
        if line_scores == [72]:
            continue
        preferred = [s for s in line_scores if s != 72]
        if preferred:
            best = max(preferred)
        else:
            best = max(line_scores)
        scores.append((best, round(conf, 3)))

    return scores

# ---------------------------------------------------------------------------
# Stage 1A: Scorecard screen detection
# ---------------------------------------------------------------------------
def detect_scorecard(frame, ocr_engine, region, log, save_debug=False, debug_dir="captures"):
    """Check if 'SCORE CARD' text is visible in the detection region.
    Returns (detected: bool, text: str) — text is the raw OCR for course fallback.
    """
    cropped = crop_region(frame, region)

    # Save debug crop AND full frame on first few color-triggered calls
    if save_debug:
        try:
            import datetime
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            from PIL import Image
            # Save detection region crop
            debug_path = os.path.join(debug_dir, f"debug_detect_{ts}.png")
            Image.fromarray(cropped).save(debug_path)
            # Save full frame
            full_path = os.path.join(debug_dir, f"debug_full_{ts}.png")
            Image.fromarray(frame).save(full_path)
            log.debug(f"Saved debug images: {debug_path} and {full_path}")
        except Exception as e:
            log.debug(f"Could not save debug crop: {e}")

    try:
        texts = ocr_read(ocr_engine, cropped, detail=False, log=log)
        text = " ".join(texts).upper()
        log.debug(f"Detection OCR text: {text}")
        if "SCORE CARD" in text or "SCORE  CARD" in text:
            return True, text
    except Exception as e:
        log.error(f"Detection OCR error: {e}")
    return False, ""

# ---------------------------------------------------------------------------
# Stage 1B: Game completion detection
# ---------------------------------------------------------------------------
def detect_game_complete(frame, ocr_engine, region, log):
    """Check if game is complete by looking for STROKE/STABLEFORD buttons."""
    cropped = crop_region(frame, region)
    try:
        texts = ocr_read(ocr_engine, cropped, detail=False)
        text = " ".join(texts).upper()
        log.debug(f"Completion check OCR text: {text}")
        if "STROKE" in text or "STABLEFORD" in text or "PERIO" in text:
            log.info("Game completion confirmed (STROKE/STABLEFORD buttons found)")
            return True
    except Exception as e:
        log.error(f"Completion detection OCR error: {e}")
    return False

# ---------------------------------------------------------------------------
# Stage 2: Score extraction (full OCR)
# ---------------------------------------------------------------------------
def extract_scores(frame, ocr_engine, cfg, log, detection_text=""):
    """Extract player names, total scores, and confidence from scorecard."""
    from PIL import Image
    import numpy as np
    results = {"course": "", "players": []}

    # OCR the name region — upscale 5x for better small-text detection
    name_crop = crop_region(frame, cfg["name_region"])
    try:
        pil_crop = Image.fromarray(name_crop)
        upscaled = pil_crop.resize(
            (pil_crop.width * 5, pil_crop.height * 5), Image.LANCZOS
        )
        name_input = np.array(upscaled)
        name_results = ocr_read(ocr_engine, name_input, detail=True)
        log.info(f"Name region raw OCR: {[(t, round(c, 3)) for _, t, c in name_results]}")
    except Exception as e:
        log.error(f"Name OCR error: {e}")
        name_results = []
        name_input = name_crop

    # OCR the score region
    score_crop = crop_region(frame, cfg["score_region"])
    try:
        score_results = ocr_read(ocr_engine, score_crop, detail=True)
        log.info(f"Score region raw OCR: {[(t, round(c, 3)) for _, t, c in score_results]}")
    except Exception as e:
        log.error(f"Score OCR error: {e}")
        score_results = []

    # Detect Stableford icons to decide whether to strip S artifacts from names
    has_icons = detect_stableford_icons(frame)
    if has_icons:
        log.info("Stableford icons detected — will strip S/I artifacts from names")

    names = parse_name_candidates(
        name_results, strip_icon=has_icons,
        crop_height=name_input.shape[0] if len(name_results) > 0 else None,
    )
    scores = parse_score_candidates(score_results)
    log.info(f"Parsed name candidates: {names}")
    log.info(f"Parsed score candidates: {scores}")

    # Build a row_index → name mapping for positional alignment
    # Merge multiple names in the same row (e.g. "b" + "mollon" → "b mollon")
    name_by_row = {}
    for entry in names:
        name, conf, row_idx = entry
        if row_idx in name_by_row:
            prev_name, prev_conf = name_by_row[row_idx]
            name_by_row[row_idx] = (f"{prev_name} {name}", min(prev_conf, conf))
        else:
            name_by_row[row_idx] = (name, conf)

    # Pair scores with names using row alignment
    for i in range(len(scores)):
        score, score_conf = scores[i]
        if score == 0:
            continue
        if i in name_by_row:
            name, name_conf = name_by_row[i]
        else:
            name, name_conf = f"Player {i + 1}", 0.0
        results["players"].append({
            "seat_index": i + 1,
            "name": name,
            "total_score": score,
            "name_confidence": name_conf,
            "score_confidence": score_conf,
        })

    # Course name — try OCR first, fall back to detection text
    try:
        course_crop = crop_region(frame, cfg["course_region"])
        course_texts = ocr_read(ocr_engine, course_crop, detail=False)
        course_text = " ".join(course_texts)
        if course_text:
            results["course"] = course_text
            log.info(f"Course name raw OCR: {course_text}")
    except Exception as e:
        log.debug(f"Course OCR error: {e}")

    # Fallback: extract course from detection text (e.g. "MAUNA OCEAN C.C SCORE CARD")
    if not results["course"] and detection_text:
        dt = detection_text.upper()
        for marker in ["SCORE CARD", "SCORE  CARD"]:
            idx = dt.find(marker)
            if idx > 0:
                results["course"] = detection_text[:idx].strip()
                log.info(f"Course from detection text: {results['course']}")
                break

    return results

# ---------------------------------------------------------------------------
# Save helpers
# ---------------------------------------------------------------------------
def save_screenshot(frame, save_dir, prefix="scorecard"):
    """Save full frame, overwriting the previous capture. Only the latest screenshot is kept."""
    os.makedirs(save_dir, exist_ok=True)
    filename = f"{prefix}_latest.png"
    path = os.path.join(save_dir, filename)
    from PIL import Image
    img = Image.fromarray(frame)
    img.save(path)
    return path


# ---------------------------------------------------------------------------
# Google Drive upload
# ---------------------------------------------------------------------------
SCOPES = ["https://www.googleapis.com/auth/drive.file"]
TOKEN_FILE = "token.json"


def _get_drive_service(cfg, log):
    """Initialize Google Drive API service using OAuth2 tokens."""
    client_secret = cfg.get("google_drive_client_secret", "")
    if not client_secret or not os.path.exists(client_secret):
        return None
    if not os.path.exists(TOKEN_FILE):
        log.error("No token.json found. Run: python capture.py --auth to authenticate.")
        return None
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, "w") as f:
                f.write(creds.to_json())
        return build("drive", "v3", credentials=creds)
    except Exception as e:
        log.error(f"Google Drive auth failed: {e}")
        return None


def run_auth_flow(cfg):
    """One-time OAuth2 login — opens browser, saves token.json."""
    client_secret = cfg.get("google_drive_client_secret", "")
    if not client_secret or not os.path.exists(client_secret):
        print(f"ERROR: Client secret file not found: {client_secret}")
        print("Download it from Google Cloud Console → Credentials → OAuth client ID")
        sys.exit(1)
    from google_auth_oauthlib.flow import InstalledAppFlow
    flow = InstalledAppFlow.from_client_secrets_file(client_secret, SCOPES)
    creds = flow.run_local_server(port=0)
    with open(TOKEN_FILE, "w") as f:
        f.write(creds.to_json())
    print(f"Authentication successful! Token saved to {TOKEN_FILE}")
    print("You can now run the capture script normally.")


def _get_or_create_folder(service, parent_id, folder_name):
    """Find a subfolder by name under parent, or create it."""
    query = (
        f"'{parent_id}' in parents and name='{folder_name}' "
        f"and mimeType='application/vnd.google-apps.folder' and trashed=false"
    )
    results = service.files().list(q=query, fields="files(id)").execute()
    files = results.get("files", [])
    if files:
        return files[0]["id"]
    metadata = {
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    folder = service.files().create(body=metadata, fields="id").execute()
    return folder["id"]


def upload_to_google_drive(results, screenshot_path, cfg, log):
    """Upload screenshot + results JSON to Google Drive.
    Folder structure: root / Bay {N} / {YYYY-MM-DD} /
    Returns the screenshot Drive web link, or None on failure.
    """
    root_folder_id = cfg.get("google_drive_folder_id", "")
    if not root_folder_id:
        log.debug("Google Drive folder ID not configured, skipping upload")
        return None
    service = _get_drive_service(cfg, log)
    if not service:
        log.debug("Google Drive credentials not configured, skipping upload")
        return None
    try:
        from googleapiclient.http import MediaFileUpload, MediaInMemoryUpload
        from PIL import Image

        bay_num = cfg["bay_number"]
        today = datetime.now().strftime("%Y-%m-%d")
        timestamp = datetime.now().strftime("%H%M%S")

        # Create folder hierarchy: root → Bay {N} → {date}
        bay_folder_id = _get_or_create_folder(service, root_folder_id, f"Bay {bay_num}")
        date_folder_id = _get_or_create_folder(service, bay_folder_id, today)

        screenshot_link = None

        # Upload screenshot as JPEG
        if screenshot_path and os.path.exists(screenshot_path):
            jpeg_path = screenshot_path.replace(".png", "_upload.jpg")
            img = Image.open(screenshot_path)
            img.convert("RGB").save(jpeg_path, format="JPEG", quality=80)

            file_meta = {"name": f"{timestamp}.jpg", "parents": [date_folder_id]}
            media = MediaFileUpload(jpeg_path, mimetype="image/jpeg")
            uploaded = service.files().create(
                body=file_meta, media_body=media, fields="id,webViewLink"
            ).execute()

            try:
                os.remove(jpeg_path)
            except OSError:
                pass

            screenshot_link = uploaded.get("webViewLink", "")
            log.info(f"Screenshot uploaded to Drive: Bay {bay_num}/{today}/{timestamp}.jpg")

        # Upload results JSON
        result_entry = {
            "timestamp": datetime.now().isoformat(),
            "bay_number": bay_num,
            "source_version": SCRIPT_VERSION,
            "course": results.get("course", ""),
            "players": results.get("players", []),
        }
        if screenshot_link:
            result_entry["screenshot_url"] = screenshot_link

        json_bytes = json.dumps(result_entry, ensure_ascii=False, indent=2).encode("utf-8")
        json_meta = {"name": f"{timestamp}.json", "parents": [date_folder_id]}
        json_media = MediaInMemoryUpload(json_bytes, mimetype="application/json")
        service.files().create(body=json_meta, media_body=json_media, fields="id").execute()
        log.info(f"Results uploaded to Drive: Bay {bay_num}/{today}/{timestamp}.json")

        return screenshot_link

    except Exception as e:
        log.error(f"Google Drive upload failed: {e}")
        return None

# ---------------------------------------------------------------------------
# POS submission
# ---------------------------------------------------------------------------
def submit_to_pos(results, screenshot_path, cfg, log):
    """Upload to Google Drive, then POST score results to POS API.
    Returns True if Google Drive upload succeeded.
    """
    drive_link = None
    drive_ok = False
    try:
        drive_link = upload_to_google_drive(results, screenshot_path, cfg, log)
        if drive_link:
            drive_ok = True
    except Exception as e:
        log.error(f"Google Drive upload error: {e}")

    # POST results to POS server
    url = cfg.get("pos_server_url", "")
    if not url:
        log.debug("No POS server URL configured, skipping server submission")
        return drive_ok
    try:
        import requests

        payload = {
            "bay_number": cfg["bay_number"],
            "timestamp": datetime.now().isoformat(),
            "source_version": SCRIPT_VERSION,
            "course": results.get("course", ""),
            "players": results["players"],
        }
        if drive_link:
            payload["screenshot_url"] = drive_link

        headers = {
            "x-score-ingest-key": cfg.get("ingest_secret", ""),
            "Content-Type": "application/json",
        }

        log.info(f"Submitting to POS: {url}")
        log.debug(f"Payload: {json.dumps(payload, ensure_ascii=False)}")
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        log.info(f"POS response: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        log.error(f"POS submission failed: {e}")

    return drive_ok

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    cfg = load_config()
    log = setup_logging(cfg["log_file"])

    log.info("=" * 60)
    log.info("Konegolf Score Capture Starting")
    log.info(f"Script version: {SCRIPT_VERSION}")
    log.info(f"Bay: {cfg['bay_number']}")
    log.info(f"Capture interval: {cfg['capture_interval_seconds']}s")
    log.info(f"Cooldown after detection: {cfg['cooldown_seconds']}s")
    log.info(f"POS URL: {cfg.get('pos_server_url', 'not configured')}")
    log.info("=" * 60)

    # Import heavy dependencies
    log.info("Loading dxcam...")
    try:
        import dxcam
    except ImportError:
        log.error("dxcam not installed. Run: pip install dxcam")
        sys.exit(1)

    log.info("Loading PaddleOCR (this may take a minute on first run)...")
    # Workaround: some bay PCs lack root CA certs, causing SSL errors
    # when models are downloaded on first run.
    try:
        import ssl
        ssl._create_default_https_context = ssl._create_unverified_context
        log.debug("SSL certificate verification disabled (bay PC workaround)")
    except Exception:
        pass

    try:
        import os as _os
        _os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
        # Disable oneDNN — causes crash on some Intel CPUs:
        # "ConvertPirAttribute2RuntimeAttribute not support"
        _os.environ["FLAGS_use_mkldnn"] = "0"
        import paddle
        paddle.set_flags({'FLAGS_use_mkldnn': 0})
        from paddleocr import PaddleOCR
    except ImportError:
        log.error("paddleocr not installed. Run: pip install paddlepaddle paddleocr")
        sys.exit(1)

    # Initialize
    log.info("Initializing DXGI capture...")
    try:
        camera = dxcam.create()
        log.info("DXGI camera ready")
    except Exception as e:
        log.error(f"Failed to create DXGI camera: {e}")
        sys.exit(1)

    log.info("Initializing PaddleOCR (lang=en)...")
    try:
        reader = PaddleOCR(lang="en")
        log.info("PaddleOCR ready")
    except Exception as e:
        log.error(f"Failed to initialize PaddleOCR: {e}")
        sys.exit(1)

    log.info("Capture loop started. Watching for scorecard...")
    log.info("Strategy: color pre-filter (0.5s) → save on match → OCR verify after gone.")
    log.info("Captures frame instantly on color match; verifies with OCR after scorecard disappears.")

    frame_count = 0
    pending_frame = None        # The latest color-matched frame (numpy array)
    pending_path = None         # Path to saved pending capture file
    color_streak = 0            # How many consecutive color-matched frames
    last_finalized_time = 0     # When we last finalized a capture (cooldown anchor)
    GONE_THRESHOLD = 3          # Must be gone for 3 frames (1.5s) to confirm disappeared

    gone_count = 0

    try:
        while True:
            time.sleep(cfg["capture_interval_seconds"])

            # Cooldown — don't re-detect within cooldown window
            if time.time() - last_finalized_time < cfg["cooldown_seconds"]:
                remaining = int(cfg["cooldown_seconds"] - (time.time() - last_finalized_time))
                if frame_count % 120 == 0:
                    log.debug(f"Cooldown active, {remaining}s remaining")
                frame_count += 1
                color_streak = 0
                pending_frame = None
                pending_path = None
                gone_count = 0
                continue

            # Grab frame
            frame = camera.grab()
            frame_count += 1

            if frame is None:
                if frame_count % 60 == 0:
                    log.debug("Empty frame (screen idle)")
                continue

            # Stage 0: Fast color pre-filter (~0ms)
            color_match = scorecard_color_check(frame)

            if color_match:
                gone_count = 0
                color_streak += 1
                # Save/overwrite the pending capture (rolling — always keeps latest)
                pending_frame = frame.copy()
                if color_streak == 1:
                    log.info("Color match — potential scorecard, saving frame...")
                elif color_streak % 20 == 0:
                    log.debug(f"Color still matching (streak={color_streak})")
            else:
                # Color doesn't match
                if pending_frame is not None:
                    gone_count += 1
                    if gone_count >= GONE_THRESHOLD:
                        # Scorecard disappeared — verify the saved frame with OCR
                        log.info(f"Color gone after {color_streak} matches — verifying with OCR...")

                        # Run OCR on the pending frame to check for "SCORE CARD"
                        is_scorecard, det_text = detect_scorecard(
                            pending_frame, reader, cfg["detect_region"], log
                        )

                        if is_scorecard:
                            log.info("=" * 60)
                            log.info(f"SCORECARD CONFIRMED by OCR — extracting scores!")
                            log.info("=" * 60)

                            # Save screenshot
                            screenshot_path = save_screenshot(
                                pending_frame, cfg["capture_save_dir"], prefix="scorecard"
                            )
                            log.info(f"Screenshot saved locally: {screenshot_path}")

                            # Full OCR extraction
                            log.info("Running OCR extraction...")
                            results = extract_scores(
                                pending_frame, reader, cfg, log,
                                detection_text=det_text,
                            )

                            log.info("-" * 40)
                            log.info("EXTRACTION RESULTS:")
                            log.info(f"  Course: {results.get('course', 'unknown')}")
                            for p in results["players"]:
                                nc = p.get('name_confidence', '?')
                                sc = p.get('score_confidence', '?')
                                log.info(f"  Player: {p['name']} (conf={nc}) | Score: {p['total_score']} (conf={sc})")
                            if not results["players"]:
                                log.warning("  No players extracted — OCR may need region tuning")
                            log.info("-" * 40)

                            # Upload to Google Drive + POS server
                            drive_ok = submit_to_pos(results, screenshot_path, cfg, log)

                            if drive_ok:
                                try:
                                    os.remove(screenshot_path)
                                    log.debug(f"Cleaned up local screenshot: {screenshot_path}")
                                except OSError:
                                    pass
                            else:
                                log.info(f"Keeping local screenshot (Drive upload failed): {screenshot_path}")

                            last_finalized_time = time.time()
                            log.info(f"Cooldown started ({cfg['cooldown_seconds']}s)")
                            log.info("=" * 60)
                        else:
                            log.debug(f"Color match was false positive (OCR: '{det_text[:80]}') — discarding")

                        # Reset state
                        pending_frame = None
                        pending_path = None
                        color_streak = 0
                        gone_count = 0
                    else:
                        log.debug(f"Color gone ({gone_count}/{GONE_THRESHOLD}) — waiting to confirm")
                else:
                    color_streak = 0
                    gone_count = 0

            if frame_count % 120 == 0:
                log.debug(f"Frame #{frame_count} — color: {color_match}, streak: {color_streak}")

    except KeyboardInterrupt:
        log.info("Stopped by user (Ctrl+C)")
    except Exception as e:
        log.error(f"Unexpected error: {e}", exc_info=True)
    finally:
        del camera
        log.info("Camera released. Exiting.")


if __name__ == "__main__":
    if "--auth" in sys.argv:
        cfg = load_config()
        run_auth_flow(cfg)
    else:
        main()
