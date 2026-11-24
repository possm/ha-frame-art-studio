"""Samsung The Frame Art Mode client for Home Assistant.

Compatible with both samsungtvws 3.x (SamsungTVArt) and 2.x (SamsungTVWS.art()),
and uses a dedicated client name & token file so it runs cleanly alongside
samsungtv_smart or the built-in samsungtv integration.
"""

from __future__ import annotations

import asyncio
import base64
from contextlib import contextmanager
from ipaddress import IPv4Address
import json
from pathlib import Path
import socket
from typing import Any
from urllib.request import urlopen

from .const import (
    CONTENT_ID_RE,
    MY_PHOTOS_CATEGORY,
    TV_INFO_PORT,
    TV_PORT,
)


def validate_host(raw_host: str) -> str:
    """Validate and normalize an IPv4 address."""
    return str(IPv4Address((raw_host or "").strip()))


def validate_content_id(content_id: Any) -> str:
    """Validate a Samsung Art Mode content_id."""
    if not isinstance(content_id, str) or not CONTENT_ID_RE.fullmatch(content_id):
        raise ValueError("Ongeldig content_id.")
    return content_id


def check_tv_reachable(host: str, port: int = TV_PORT, timeout: float = 3.5) -> None:
    """Fast TCP reachability check to avoid long WebSocket stalls."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return
    except OSError as exc:
        raise ConnectionError(
            f"Geen verbinding met {host}:{port}. Controleer of de tv aan of in Art Mode staat."
        ) from exc


def fetch_tv_device_info(host: str, timeout: float = 3.5) -> dict[str, Any]:
    """Read basic device info from http://<host>:8001/api/v2/."""
    with urlopen(f"http://{host}:{TV_INFO_PORT}/api/v2/", timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("Onverwacht antwoord van de tv.")
        return data


@contextmanager
def open_tv_art(host: str, token_dir: Path):
    """Open a Samsung Art Mode session supporting both samsungtvws 3.x and 2.x."""
    check_tv_reachable(host, port=TV_PORT, timeout=3.5)
    token_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    token_file = str(token_dir / host)

    try:
        from samsungtvws import SamsungTVArt  # type: ignore[attr-defined]
    except ImportError:
        from samsungtvws import SamsungTVWS

        tv = SamsungTVWS(
            host,
            port=TV_PORT,
            timeout=25,
            name="Frame Art Studio",
            token_file=token_file,
        )
        try:
            yield tv.art()
        finally:
            try:
                tv.close()
            except Exception:
                pass
        return

    with SamsungTVArt(
        host,
        port=TV_PORT,
        timeout=25,
        name="Frame Art Studio",
        token_file=token_file,
    ) as art:
        yield art


def _delete_ids_on_art(art: Any, ids: list[str]) -> list[str]:
    """Delete content IDs in safe chunks with per-item fallback."""
    deleted: list[str] = []
    for i in range(0, len(ids), 20):
        chunk = ids[i : i + 20]
        try:
            if art.delete_list(chunk):
                deleted.extend(chunk)
                continue
        except Exception:
            pass
        for cid in chunk:
            try:
                if art.delete(cid):
                    deleted.append(cid)
            except Exception:
                pass
    return deleted


def _upload_slot_sync(
    host: str,
    token_dir: Path,
    image_bytes: bytes,
    file_type: str,
    select: bool,
    previous_id: str | None,
) -> tuple[str, list[str]]:
    with open_tv_art(host, token_dir) as art:
        content_id = art.upload(
            image_bytes,
            file_type=file_type,
            matte="none",
            portrait_matte="none",
        )
        if not content_id:
            raise RuntimeError("De tv gaf geen bevestiging voor de upload.")

        if select:
            try:
                art.select_image(content_id, show=True)
            except Exception:
                pass

        deleted: list[str] = []
        if previous_id and previous_id != content_id:
            # Never try to delete if the previous image is still the active one on TV
            current_id = None
            try:
                current = art.get_current()
                if isinstance(current, dict):
                    current_id = current.get("content_id")
            except Exception:
                pass
            if previous_id != current_id:
                deleted = _delete_ids_on_art(art, [previous_id])

    return content_id, deleted


def _list_library_sync(
    host: str,
    token_dir: Path,
    slots: dict[str, str | None],
) -> tuple[list[dict[str, Any]], str | None]:
    with open_tv_art(host, token_dir) as art:
        items: list[dict[str, Any]] = []
        try:
            items = art.available(MY_PHOTOS_CATEGORY) or []
        except Exception:
            items = []

        if not items:
            all_items = art.available() or []
            filtered = [
                it
                for it in all_items
                if isinstance(it, dict)
                and (
                    it.get("category_id") == MY_PHOTOS_CATEGORY
                    or str(it.get("category_id", "")).startswith("MY-")
                    or str(it.get("content_id", "")).startswith(("MY_", "MY-", "F"))
                )
            ]
            items = filtered or [it for it in all_items if isinstance(it, dict)]

        current_id: str | None = None
        try:
            current = art.get_current()
            if isinstance(current, dict):
                current_id = current.get("content_id")
        except Exception:
            pass

        content_ids = [
            it["content_id"]
            for it in items
            if isinstance(it, dict) and it.get("content_id")
        ]
        thumbnails: dict[str, str] = {}
        for i in range(0, len(content_ids), 15):
            chunk = content_ids[i : i + 15]
            try:
                raw_thumbs = art.get_thumbnail_list(chunk) or {}
                for raw_name, raw_bytes in raw_thumbs.items():
                    cid = str(raw_name).split(".")[0]
                    if raw_bytes:
                        mime = (
                            "image/png"
                            if bytes(raw_bytes[:4]) == b"\x89PNG"
                            else "image/jpeg"
                        )
                        b64 = base64.b64encode(bytes(raw_bytes)).decode("ascii")
                        thumbnails[cid] = f"data:{mime};base64,{b64}"
            except Exception:
                break

    formatted: list[dict[str, Any]] = []
    for it in items:
        if not isinstance(it, dict) or not it.get("content_id"):
            continue
        cid = it["content_id"]
        slot = None
        if cid == slots.get("day"):
            slot = "day"
        elif cid == slots.get("evening"):
            slot = "evening"
        formatted.append(
            {
                "contentId": cid,
                "date": it.get("image_date") or "",
                "width": it.get("width"),
                "height": it.get("height"),
                "matteId": it.get("matte_id") or "",
                "isCurrent": cid == current_id,
                "slot": slot,
                "thumbnail": thumbnails.get(cid),
            }
        )

    formatted.sort(key=lambda x: (x["date"], x["contentId"]), reverse=True)
    return formatted, current_id


def _select_art_sync(host: str, token_dir: Path, content_id: str) -> None:
    with open_tv_art(host, token_dir) as art:
        art.select_image(content_id, show=True)


def _delete_art_sync(
    host: str,
    token_dir: Path,
    content_ids: list[str],
) -> tuple[list[str], str | None]:
    skipped_current: str | None = None
    with open_tv_art(host, token_dir) as art:
        current_id: str | None = None
        try:
            current = art.get_current()
            if isinstance(current, dict):
                current_id = current.get("content_id")
        except Exception:
            pass

        safe_ids: list[str] = []
        for cid in content_ids:
            if cid == current_id:
                skipped_current = cid
            elif cid not in safe_ids:
                safe_ids.append(cid)

        deleted = _delete_ids_on_art(art, safe_ids)
    return deleted, skipped_current


class FrameTVClient:
    """Async wrapper around Samsung The Frame Art Mode operations."""

    def __init__(self, hass: Any, host: str, token_dir: Path) -> None:
        self._hass = hass
        self.host = host
        self._token_dir = token_dir
        self._lock = asyncio.Lock()

    async def async_upload_slot(
        self,
        image_bytes: bytes,
        file_type: str = "jpg",
        select: bool = True,
        previous_id: str | None = None,
    ) -> tuple[str, list[str]]:
        async with self._lock:
            return await self._hass.async_add_executor_job(
                _upload_slot_sync,
                self.host,
                self._token_dir,
                image_bytes,
                file_type,
                select,
                previous_id,
            )

    async def async_list_library(
        self,
        slots: dict[str, str | None],
    ) -> tuple[list[dict[str, Any]], str | None]:
        async with self._lock:
            return await self._hass.async_add_executor_job(
                _list_library_sync,
                self.host,
                self._token_dir,
                slots,
            )

    async def async_select_art(self, content_id: str) -> None:
        async with self._lock:
            await self._hass.async_add_executor_job(
                _select_art_sync,
                self.host,
                self._token_dir,
                content_id,
            )

    async def async_delete_art(
        self,
        content_ids: list[str],
    ) -> tuple[list[str], str | None]:
        async with self._lock:
            return await self._hass.async_add_executor_job(
                _delete_art_sync,
                self.host,
                self._token_dir,
                content_ids,
            )
