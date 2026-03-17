"""
Konegolf Score Capture — Drive Data Analyzer

Downloads all score JSON files from Google Drive and provides
analysis of captured scores: accuracy stats, player frequency,
confidence distribution, etc.

Usage:
  python analyze_scores.py                    # Analyze without downloading (uses cached data)
  python analyze_scores.py --download         # Download from Drive first, then analyze
  python analyze_scores.py --download-only    # Just download, no analysis
  python analyze_scores.py --folder-id XXXXX  # Override Drive folder ID
"""

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime
from collections import Counter, defaultdict

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "drive_data"
CONFIG_FILE = SCRIPT_DIR / "config.json"


# ---------------------------------------------------------------------------
# Google Drive download
# ---------------------------------------------------------------------------

def get_drive_service():
    """Initialize Google Drive API using existing OAuth tokens."""
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    token_path = SCRIPT_DIR / "token.json"
    if not token_path.exists():
        print("ERROR: token.json not found. Run 'run.bat' first to authenticate.")
        sys.exit(1)

    creds = Credentials.from_authorized_user_file(str(token_path))
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_path.write_text(creds.to_json())

    return build("drive", "v3", credentials=creds)


def list_all_files(service, folder_id, mime_filter=None):
    """Recursively list all files under a Drive folder."""
    results = []
    query = f"'{folder_id}' in parents and trashed=false"
    if mime_filter:
        query += f" and mimeType='{mime_filter}'"

    page_token = None
    while True:
        resp = service.files().list(
            q=query,
            fields="nextPageToken, files(id, name, mimeType, parents)",
            pageSize=100,
            pageToken=page_token,
        ).execute()

        results.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    return results


def download_all_jsons(folder_id):
    """Download all JSON score files from Google Drive."""
    print(f"Connecting to Google Drive...")
    service = get_drive_service()

    DATA_DIR.mkdir(exist_ok=True)
    downloaded = 0
    skipped = 0

    # List bay folders
    bay_folders = list_all_files(service, folder_id, "application/vnd.google-apps.folder")
    print(f"Found {len(bay_folders)} bay folder(s): {[f['name'] for f in bay_folders]}")

    for bay_folder in bay_folders:
        bay_name = bay_folder["name"]
        bay_dir = DATA_DIR / bay_name
        bay_dir.mkdir(exist_ok=True)

        # List date folders
        date_folders = list_all_files(service, bay_folder["id"], "application/vnd.google-apps.folder")
        print(f"  {bay_name}: {len(date_folders)} date folder(s)")

        for date_folder in date_folders:
            date_name = date_folder["name"]
            date_dir = bay_dir / date_name
            date_dir.mkdir(exist_ok=True)

            # List JSON files
            json_files = list_all_files(service, date_folder["id"], "application/json")

            for jf in json_files:
                local_path = date_dir / jf["name"]
                if local_path.exists():
                    skipped += 1
                    continue

                # Download
                content = service.files().get_media(fileId=jf["id"]).execute()
                local_path.write_bytes(content)
                downloaded += 1

            # Also list JPEGs for reference count
            jpg_files = list_all_files(service, date_folder["id"], "image/jpeg")
            screenshot_count = len(jpg_files)

            print(f"    {date_name}: {len(json_files)} scores, {screenshot_count} screenshots")

    print(f"\nDownload complete: {downloaded} new, {skipped} cached")
    return DATA_DIR


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def load_all_scores(data_dir):
    """Load all JSON score files from local cache."""
    scores = []
    for json_path in sorted(data_dir.rglob("*.json")):
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            # Add file path context
            parts = json_path.relative_to(data_dir).parts
            if len(parts) >= 3:
                data["_bay_folder"] = parts[0]
                data["_date_folder"] = parts[1]
                data["_filename"] = parts[2]
            scores.append(data)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            print(f"  WARN: Could not parse {json_path}: {e}")
    return scores


def analyze(scores):
    """Print analysis of all collected scores."""
    if not scores:
        print("No score data found. Run with --download first.")
        return

    print(f"\n{'='*60}")
    print(f"  KONEGOLF SCORE ANALYSIS")
    print(f"  {len(scores)} captures analyzed")
    print(f"{'='*60}\n")

    # --- Basic stats ---
    total_players = sum(len(s.get("players", [])) for s in scores)
    bays = Counter(s.get("bay_number", s.get("_bay_folder", "?")) for s in scores)
    dates = sorted(set(s.get("_date_folder", s.get("timestamp", "")[:10]) for s in scores))

    print(f"📊 Overview")
    print(f"   Total captures:  {len(scores)}")
    print(f"   Total players:   {total_players}")
    print(f"   Date range:      {dates[0] if dates else '?'} → {dates[-1] if dates else '?'}")
    print(f"   Bays active:     {dict(bays)}")
    print()

    # --- Captures per day ---
    captures_by_date = Counter()
    for s in scores:
        date = s.get("_date_folder", s.get("timestamp", "")[:10])
        captures_by_date[date] += 1

    print(f"📅 Captures per day")
    for date in sorted(captures_by_date.keys()):
        count = captures_by_date[date]
        bar = "█" * count
        print(f"   {date}: {bar} {count}")
    print()

    # --- Player names ---
    all_names = []
    for s in scores:
        for p in s.get("players", []):
            name = p.get("name", "").strip()
            if name:
                all_names.append(name)

    name_counts = Counter(all_names)
    print(f"👤 Player names (top 20)")
    for name, count in name_counts.most_common(20):
        print(f"   {name:20s}  seen {count}x")
    print(f"   ... {len(name_counts)} unique names total")
    print()

    # --- Score distribution ---
    all_scores = []
    for s in scores:
        for p in s.get("players", []):
            score = p.get("total_score")
            if score and isinstance(score, (int, float)):
                all_scores.append(int(score))

    if all_scores:
        print(f"🏌️ Score distribution")
        print(f"   Min:     {min(all_scores)}")
        print(f"   Max:     {max(all_scores)}")
        print(f"   Average: {sum(all_scores)/len(all_scores):.1f}")
        print(f"   Median:  {sorted(all_scores)[len(all_scores)//2]}")

        # Histogram buckets
        buckets = defaultdict(int)
        for s in all_scores:
            bucket = (s // 10) * 10
            buckets[bucket] += 1

        print(f"\n   Score range distribution:")
        for bucket in sorted(buckets.keys()):
            count = buckets[bucket]
            bar = "█" * count
            print(f"   {bucket:3d}-{bucket+9:3d}: {bar} {count}")
        print()

    # --- Confidence analysis ---
    name_confs = []
    score_confs = []
    low_conf_entries = []

    for s in scores:
        for p in s.get("players", []):
            nc = p.get("name_confidence")
            sc = p.get("score_confidence")
            if nc is not None:
                name_confs.append(nc)
                if nc < 0.7:
                    low_conf_entries.append({
                        "type": "name",
                        "value": p.get("name", "?"),
                        "confidence": nc,
                        "date": s.get("_date_folder", "?"),
                        "bay": s.get("bay_number", "?"),
                    })
            if sc is not None:
                score_confs.append(sc)
                if sc < 0.7:
                    low_conf_entries.append({
                        "type": "score",
                        "value": p.get("total_score", "?"),
                        "confidence": sc,
                        "date": s.get("_date_folder", "?"),
                        "bay": s.get("bay_number", "?"),
                    })

    if name_confs:
        print(f"🎯 OCR Confidence")
        print(f"   Name confidence:  avg {sum(name_confs)/len(name_confs):.3f}  min {min(name_confs):.3f}")
        print(f"   Score confidence: avg {sum(score_confs)/len(score_confs):.3f}  min {min(score_confs):.3f}")

        high_conf = sum(1 for c in name_confs if c >= 0.7)
        print(f"   Names ≥ 0.7:     {high_conf}/{len(name_confs)} ({high_conf/len(name_confs)*100:.1f}%)")

        high_score_conf = sum(1 for c in score_confs if c >= 0.7)
        print(f"   Scores ≥ 0.7:    {high_score_conf}/{len(score_confs)} ({high_score_conf/len(score_confs)*100:.1f}%)")

        if low_conf_entries:
            print(f"\n   ⚠️  Low confidence entries ({len(low_conf_entries)}):")
            for e in low_conf_entries[:10]:
                print(f"      {e['date']} Bay {e['bay']}: {e['type']}={e['value']} (conf={e['confidence']:.3f})")
            if len(low_conf_entries) > 10:
                print(f"      ... and {len(low_conf_entries)-10} more")
        print()

    # --- Course frequency ---
    courses = Counter()
    for s in scores:
        course = s.get("course", "").strip()
        if course:
            courses[course] += 1

    if courses:
        print(f"⛳ Courses played")
        for course, count in courses.most_common():
            print(f"   {course:30s}  {count}x")
        print()

    # --- Version tracking ---
    versions = Counter(s.get("source_version", "?") for s in scores)
    print(f"📦 Capture versions")
    for v, count in versions.most_common():
        print(f"   {v}: {count} captures")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Analyze Konegolf score data from Google Drive")
    parser.add_argument("--download", action="store_true", help="Download from Drive before analyzing")
    parser.add_argument("--download-only", action="store_true", help="Only download, skip analysis")
    parser.add_argument("--folder-id", help="Google Drive root folder ID (overrides config.json)")
    parser.add_argument("--data-dir", help="Local data directory (default: drive_data/)")
    args = parser.parse_args()

    data_dir = Path(args.data_dir) if args.data_dir else DATA_DIR

    if args.download or args.download_only:
        folder_id = args.folder_id
        if not folder_id:
            if CONFIG_FILE.exists():
                cfg = json.loads(CONFIG_FILE.read_text())
                folder_id = cfg.get("google_drive_folder_id", "")
            if not folder_id:
                print("ERROR: No folder ID. Use --folder-id or set google_drive_folder_id in config.json")
                sys.exit(1)

        download_all_jsons(folder_id)

        if args.download_only:
            return

    scores = load_all_scores(data_dir)
    analyze(scores)


if __name__ == "__main__":
    main()
