"""Constants for the Frame Art Studio Home Assistant integration."""

from __future__ import annotations

import re

DOMAIN = "frame_art_studio"
VERSION = "1.0.0"
FRONTEND_ASSET_VERSION = "1.0.0-3"

CONF_HOST = "host"
CONF_NAME = "name"
CONF_SHOW_SIDEBAR = "show_sidebar"

DEFAULT_HOST = "192.168.1.92"
DEFAULT_NAME = "The Frame"
DEFAULT_SHOW_SIDEBAR = True

MY_PHOTOS_CATEGORY = "MY-C0002"
CONTENT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

MAX_UPLOAD_BYTES = 28 * 1024 * 1024
TV_PORT = 8002
TV_INFO_PORT = 8001

STATIC_URL_PATH = "/frame_art_studio_static"
PANEL_URL_PATH = "frame-art-studio"
PANEL_TITLE = "Frame Art Studio"
PANEL_ICON = "mdi:image-frame"

SLOT_DAY = "day"
SLOT_EVENING = "evening"
VALID_SLOTS = (SLOT_DAY, SLOT_EVENING)

MODE_LABELS = {
    SLOT_DAY: "Dag",
    SLOT_EVENING: "Avond",
}
LABEL_TO_SLOT = {label: slot for slot, label in MODE_LABELS.items()}

SERVICE_SELECT_MODE = "select_mode"
PLATFORMS = ["sensor", "select"]

STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}_slots"
