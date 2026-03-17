"""
Konegolf Score Capture — Auto-Updater

Checks GitHub Releases API for a newer version of the screen capture script.
If a newer version is found, downloads the update zip, extracts it, and
overwrites app files while preserving local config/auth/captures.

Exit codes:
  0  — No update needed (or update check failed gracefully)
  10 — Update applied, caller should restart
  1  — Fatal error
"""

import os
import sys
import json
import shutil
import logging
import tempfile
import ssl
import zipfile
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# Workaround: some bay PCs lack root CA certs, causing SSL errors
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except AttributeError:
    pass

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
VERSION_FILE = SCRIPT_DIR / "VERSION.txt"
LOG_FILE = SCRIPT_DIR / "updater.log"

# Try both repo slugs (GitHub renamed from k-golf to konegolf)
REPO_CANDIDATES = [
    "HanKyungSung/konegolf",
    "HanKyungSung/k-golf",
]

RELEASE_TAG_PREFIX = "screen-capture-v"
UPDATE_ASSET_NAME = "konegolf-screen-capture-update.zip"

# Files/dirs that must NEVER be overwritten by an update
PRESERVE = {
    "config.json",
    "token.json",
    "client_secret.json",
    "captures",
    "updater.log",
    "score_capture.log",
}

EXIT_CODE_NO_UPDATE = 0
EXIT_CODE_UPDATED = 10
EXIT_CODE_ERROR = 1

# GitHub API unauthenticated rate limit: 60 req/hr per IP
API_TIMEOUT = 15  # seconds

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [updater] %(levelname)s  %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("updater")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_local_version() -> str:
    """Read the current version from VERSION.txt."""
    try:
        return VERSION_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        log.warning("VERSION.txt not found, assuming version 0.0.0")
        return "0.0.0"


def parse_version(tag: str) -> tuple:
    """
    Parse a version string like '2.1.0' or 'screen-capture-v2.1.0'
    into a tuple of ints for comparison: (2, 1, 0).
    """
    version_str = tag
    if version_str.startswith(RELEASE_TAG_PREFIX):
        version_str = version_str[len(RELEASE_TAG_PREFIX):]

    parts = []
    for part in version_str.split("."):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(0)
    return tuple(parts)


def github_api_get(url: str) -> dict:
    """Make a GET request to the GitHub API and return parsed JSON."""
    req = Request(url)
    req.add_header("Accept", "application/vnd.github.v3+json")
    req.add_header("User-Agent", "konegolf-updater")

    with urlopen(req, timeout=API_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_latest_release() -> dict | None:
    """
    Check GitHub Releases API for the latest release with our tag prefix.
    Tries multiple repo slugs to handle the rename transition.
    Returns the release JSON dict, or None if no matching release found.
    """
    for repo in REPO_CANDIDATES:
        url = f"https://api.github.com/repos/{repo}/releases"
        try:
            releases = github_api_get(url)
            # Find the latest release matching our tag prefix
            for release in releases:
                tag = release.get("tag_name", "")
                if tag.startswith(RELEASE_TAG_PREFIX):
                    log.info(f"Found release {tag} from {repo}")
                    return release
        except HTTPError as e:
            if e.code == 404:
                log.debug(f"Repo {repo} not found or no releases, trying next...")
                continue
            elif e.code == 403:
                log.warning(f"GitHub API rate limit hit for {repo}")
                continue
            else:
                log.warning(f"GitHub API error for {repo}: {e}")
                continue
        except (URLError, OSError) as e:
            log.warning(f"Network error checking {repo}: {e}")
            continue

    return None


def find_update_asset(release: dict) -> str | None:
    """Find the download URL for our update zip in the release assets."""
    for asset in release.get("assets", []):
        if asset.get("name") == UPDATE_ASSET_NAME:
            return asset.get("browser_download_url")
    return None


def download_file(url: str, dest: Path) -> None:
    """Download a file from a URL to a local path."""
    req = Request(url)
    req.add_header("User-Agent", "konegolf-updater")

    log.info(f"Downloading {url}...")
    with urlopen(req, timeout=60) as resp:
        with open(dest, "wb") as f:
            shutil.copyfileobj(resp, f)

    size_mb = dest.stat().st_size / (1024 * 1024)
    log.info(f"Downloaded {size_mb:.1f} MB to {dest.name}")


def apply_update(zip_path: Path) -> None:
    """
    Extract the update zip and copy new files over old ones,
    skipping files/dirs listed in PRESERVE.
    """
    with tempfile.TemporaryDirectory(prefix="konegolf-update-") as tmp_dir:
        tmp = Path(tmp_dir)

        # Extract zip
        log.info("Extracting update zip...")
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp)

        # The zip might contain files at the root or inside a subdirectory.
        # Detect: if there's exactly one directory at root, use it as the source.
        entries = list(tmp.iterdir())
        if len(entries) == 1 and entries[0].is_dir():
            source_dir = entries[0]
        else:
            source_dir = tmp

        # Copy files, skipping preserved ones
        updated_count = 0
        skipped_count = 0

        for item in source_dir.iterdir():
            if item.name in PRESERVE:
                log.info(f"  SKIP (preserved): {item.name}")
                skipped_count += 1
                continue

            dest = SCRIPT_DIR / item.name

            if item.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(item, dest)
                log.info(f"  UPDATE (dir): {item.name}")
            else:
                shutil.copy2(item, dest)
                log.info(f"  UPDATE: {item.name}")

            updated_count += 1

        log.info(f"Update applied: {updated_count} updated, {skipped_count} preserved")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def check_and_update() -> int:
    """
    Main update logic.
    Returns EXIT_CODE_UPDATED (10) if an update was applied,
    EXIT_CODE_NO_UPDATE (0) otherwise.
    """
    local_version = read_local_version()
    log.info(f"Current version: {local_version}")

    # Fetch latest release from GitHub
    release = fetch_latest_release()
    if release is None:
        log.info("No matching release found. Skipping update.")
        return EXIT_CODE_NO_UPDATE

    remote_tag = release.get("tag_name", "")
    remote_version = remote_tag
    if remote_version.startswith(RELEASE_TAG_PREFIX):
        remote_version = remote_version[len(RELEASE_TAG_PREFIX):]

    log.info(f"Latest release: {remote_tag} (version {remote_version})")

    # Compare versions
    local_tuple = parse_version(local_version)
    remote_tuple = parse_version(remote_tag)

    if remote_tuple <= local_tuple:
        log.info("Already up to date.")
        return EXIT_CODE_NO_UPDATE

    log.info(f"New version available: {local_version} → {remote_version}")

    # Find download URL
    download_url = find_update_asset(release)
    if download_url is None:
        log.warning(
            f"Release {remote_tag} has no asset named '{UPDATE_ASSET_NAME}'. "
            "Skipping update."
        )
        return EXIT_CODE_NO_UPDATE

    # Download to temp file
    with tempfile.TemporaryDirectory(prefix="konegolf-dl-") as dl_dir:
        zip_path = Path(dl_dir) / UPDATE_ASSET_NAME
        try:
            download_file(download_url, zip_path)
        except Exception as e:
            log.error(f"Download failed: {e}")
            return EXIT_CODE_NO_UPDATE

        # Validate zip
        if not zipfile.is_zipfile(zip_path):
            log.error("Downloaded file is not a valid zip. Skipping update.")
            return EXIT_CODE_NO_UPDATE

        # Apply update
        try:
            apply_update(zip_path)
        except Exception as e:
            log.error(f"Failed to apply update: {e}")
            return EXIT_CODE_NO_UPDATE

    # Update VERSION.txt to the new version
    VERSION_FILE.write_text(remote_version + "\n", encoding="utf-8")
    log.info(f"VERSION.txt updated to {remote_version}")

    log.info("Update complete! Signaling restart (exit code 10).")
    return EXIT_CODE_UPDATED


def main():
    log.info("=" * 50)
    log.info("Konegolf Updater starting...")

    try:
        exit_code = check_and_update()
    except Exception as e:
        log.error(f"Unexpected error: {e}", exc_info=True)
        log.info("Continuing with current version.")
        exit_code = EXIT_CODE_NO_UPDATE

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
