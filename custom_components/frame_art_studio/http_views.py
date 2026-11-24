"""Authenticated HTTP views for Frame Art Studio sidebar panel."""

from __future__ import annotations

import logging
from typing import Any

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN, MAX_UPLOAD_BYTES, SLOT_DAY, SLOT_EVENING, VALID_SLOTS
from .coordinator import FrameGeneratorEntryData
from .tv import validate_content_id

_LOGGER = logging.getLogger(__name__)


def _get_entries(hass: HomeAssistant) -> dict[str, FrameGeneratorEntryData]:
    domain_data = hass.data.get(DOMAIN, {})
    return domain_data.get("entries", {})


def _resolve_entry(
    hass: HomeAssistant, entry_id: str | None
) -> FrameGeneratorEntryData | None:
    entries = _get_entries(hass)
    if entry_id and entry_id in entries:
        return entries[entry_id]
    if entries:
        return next(iter(entries.values()))
    return None


class FrameConfigView(HomeAssistantView):
    """Return configured Frame TVs and their latest Day/Evening content_ids."""

    url = "/api/frame_art_studio/config"
    name = "api:frame_art_studio:config"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        entries = _get_entries(hass)
        tvs = [
            {
                "entryId": entry.entry_id,
                "name": entry.name,
                "host": entry.host,
                "slots": entry.slots,
            }
            for entry in entries.values()
        ]
        return self.json({"tvs": tvs})


class FrameUploadView(HomeAssistantView):
    """Upload a single 4K JPEG or PNG for the Day or Evening slot."""

    url = "/api/frame_art_studio/upload"
    name = "api:frame_art_studio:upload"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        entry = _resolve_entry(hass, request.headers.get("X-Frame-Entry-Id"))
        if entry is None:
            return self.json(
                {"message": "Geen geconfigureerde Frame TV gevonden in Home Assistant."},
                status_code=404,
            )

        slot = (request.headers.get("X-Frame-Slot") or "").strip().lower()
        if slot not in VALID_SLOTS:
            return self.json(
                {"message": "Ongeldig profielslot (gebruik day of evening)."},
                status_code=400,
            )

        content_type = (request.content_type or "").lower()
        if content_type == "image/png":
            file_type = "png"
        elif content_type in ("image/jpeg", "image/jpg"):
            file_type = "jpg"
        else:
            return self.json(
                {"message": "Upload verwacht image/jpeg of image/png."},
                status_code=400,
            )

        select = request.headers.get("X-Frame-Select", "1").lower() not in (
            "0",
            "false",
            "no",
        )
        replace_previous = request.headers.get(
            "X-Frame-Replace-Previous", "1"
        ).lower() not in ("0", "false", "no")

        image_bytes = await request.read()
        if not 0 < len(image_bytes) <= MAX_UPLOAD_BYTES:
            return self.json(
                {"message": "Het bestand is leeg of groter dan 28 MB."},
                status_code=400,
            )
        if file_type == "jpg" and (
            not image_bytes.startswith(b"\xff\xd8\xff")
            or not image_bytes.endswith(b"\xff\xd9")
        ):
            return self.json(
                {"message": "Het JPEG-bestand is onvolledig."}, status_code=400
            )
        if file_type == "png" and not image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            return self.json(
                {"message": "Het PNG-bestand is onvolledig."}, status_code=400
            )

        previous_id = entry.slots.get(slot) if replace_previous else None
        try:
            content_id, deleted = await entry.client.async_upload_slot(
                image_bytes=image_bytes,
                file_type=file_type,
                select=select,
                previous_id=previous_id,
            )
        except ConnectionError as err:
            return self.json({"message": str(err)}, status_code=502)
        except Exception as err:
            _LOGGER.warning("Frame upload failed for %s: %s", entry.host, err)
            return self.json(
                {
                    "message": (
                        "De tv bevestigde de upload niet. Controleer of de tv aan of "
                        "in Art Mode staat en bevestig een eventuele melding op het scherm."
                    )
                },
                status_code=502,
            )

        update_kwargs: dict[str, Any] = {slot: content_id}
        if select:
            update_kwargs["active_mode"] = slot
        slots = await entry.async_update_slots(**update_kwargs)

        label = "Dag" if slot == SLOT_DAY else "Avond"
        removed = f" · {len(deleted)} vorige verwijderd" if deleted else ""
        return self.json(
            {
                "message": f"{label}-versie op {entry.name} gezet ({content_id}{removed}).",
                "slot": slot,
                "contentId": content_id,
                "deleted": deleted,
                "slots": slots,
            }
        )


class FrameLibraryView(HomeAssistantView):
    """Fetch user-uploaded 'Mijn foto's' artworks and thumbnails from the TV."""

    url = "/api/frame_art_studio/library"
    name = "api:frame_art_studio:library"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        entry = _resolve_entry(hass, request.query.get("entry_id"))
        if entry is None:
            return self.json(
                {"message": "Geen geconfigureerde Frame TV gevonden in Home Assistant."},
                status_code=404,
            )
        try:
            items, current_id = await entry.client.async_list_library(entry.slots)
        except ConnectionError as err:
            return self.json({"message": str(err)}, status_code=502)
        except Exception as err:
            _LOGGER.warning("Frame library fetch failed for %s: %s", entry.host, err)
            return self.json(
                {
                    "message": (
                        f"Kon de lijst op {entry.name} niet ophalen ({type(err).__name__})."
                    )
                },
                status_code=502,
            )

        return self.json(
            {
                "message": f"{len(items)} eigen foto's gevonden op {entry.name}.",
                "items": items,
                "currentId": current_id,
                "slots": entry.slots,
            }
        )


class FrameSelectView(HomeAssistantView):
    """Select an artwork by content_id on the TV."""

    url = "/api/frame_art_studio/select"
    name = "api:frame_art_studio:select"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            body = await request.json()
            entry = _resolve_entry(hass, body.get("entryId"))
            if entry is None:
                return self.json(
                    {"message": "Geen geconfigureerde Frame TV gevonden."},
                    status_code=404,
                )
            content_id = validate_content_id(body.get("contentId"))
        except Exception as err:
            return self.json({"message": str(err) or "Ongeldige aanvraag."}, status_code=400)

        try:
            await entry.client.async_select_art(content_id)
        except ConnectionError as err:
            return self.json({"message": str(err)}, status_code=502)
        except Exception as err:
            _LOGGER.warning("Frame select failed for %s: %s", entry.host, err)
            return self.json(
                {"message": f"Kon {content_id} niet selecteren op {entry.name}."},
                status_code=502,
            )

        # Keep activeMode entity synced if selected ID matches Day or Evening slot
        slots = entry.slots
        if content_id == slots.get(SLOT_DAY):
            slots = await entry.async_update_slots(active_mode=SLOT_DAY)
        elif content_id == slots.get(SLOT_EVENING):
            slots = await entry.async_update_slots(active_mode=SLOT_EVENING)

        return self.json(
            {
                "message": f"{content_id} wordt nu getoond in Art Mode.",
                "contentId": content_id,
                "slots": slots,
            }
        )


class FrameDeleteView(HomeAssistantView):
    """Delete one or more artworks from the TV (protecting the active artwork)."""

    url = "/api/frame_art_studio/delete"
    name = "api:frame_art_studio:delete"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        try:
            body = await request.json()
            entry = _resolve_entry(hass, body.get("entryId"))
            if entry is None:
                return self.json(
                    {"message": "Geen geconfigureerde Frame TV gevonden."},
                    status_code=404,
                )
            raw_ids = body.get("contentIds")
            if not isinstance(raw_ids, list) or not raw_ids:
                raise ValueError("Kies minstens één afbeelding om te verwijderen.")
            content_ids = [validate_content_id(cid) for cid in raw_ids]
        except Exception as err:
            return self.json({"message": str(err) or "Ongeldige aanvraag."}, status_code=400)

        try:
            deleted, skipped_current = await entry.client.async_delete_art(content_ids)
        except ConnectionError as err:
            return self.json({"message": str(err)}, status_code=502)
        except Exception as err:
            _LOGGER.warning("Frame delete failed for %s: %s", entry.host, err)
            return self.json(
                {"message": "Verwijderen op de tv is niet gelukt."},
                status_code=502,
            )

        deleted_set = set(deleted)
        update_kwargs: dict[str, Any] = {}
        for slot in VALID_SLOTS:
            if entry.slots.get(slot) in deleted_set:
                update_kwargs[slot] = None
        slots = (
            await entry.async_update_slots(**update_kwargs)
            if update_kwargs
            else entry.slots
        )

        if skipped_current and not deleted:
            msg = f"{skipped_current} wordt nu op de tv getoond en is daarom overgeslagen."
        else:
            extra = (
                f" ({skipped_current} overgeslagen omdat die nu actief is)"
                if skipped_current
                else ""
            )
            noun = "foto" if len(deleted) == 1 else "foto's"
            msg = f"{len(deleted)} {noun} verwijderd van {entry.name}{extra}."

        return self.json(
            {
                "message": msg,
                "deleted": deleted,
                "skippedCurrent": skipped_current,
                "slots": slots,
            }
        )
