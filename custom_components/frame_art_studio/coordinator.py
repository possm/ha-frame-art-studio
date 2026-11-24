"""Persistent slot state and listener management for Frame Art Studio."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import SLOT_DAY, SLOT_EVENING, STORAGE_KEY, STORAGE_VERSION
from .tv import FrameTVClient


class FrameGeneratorEntryData:
    """Runtime data for a single configured Samsung The Frame TV."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str,
        name: str,
        host: str,
        client: FrameTVClient,
        store: SlotStore,
    ) -> None:
        self.hass = hass
        self.entry_id = entry_id
        self.name = name
        self.host = host
        self.client = client
        self.store = store
        self._listeners: list[Callable[[], None]] = []

    @property
    def slots(self) -> dict[str, Any]:
        return self.store.get_slots(self.entry_id)

    @property
    def active_mode(self) -> str | None:
        mode = self.slots.get("activeMode")
        return mode if mode in (SLOT_DAY, SLOT_EVENING) else None

    def add_listener(self, callback: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(callback)

        def _remove() -> None:
            if callback in self._listeners:
                self._listeners.remove(callback)

        return _remove

    def notify(self) -> None:
        for callback in list(self._listeners):
            callback()

    async def async_update_slots(
        self,
        *,
        day: str | None | object = ...,
        evening: str | None | object = ...,
        active_mode: str | None | object = ...,
    ) -> dict[str, Any]:
        updated = await self.store.async_update_slots(
            self.entry_id,
            day=day,
            evening=evening,
            active_mode=active_mode,
        )
        self.notify()
        return updated

    async def async_select_mode(self, mode: str) -> str:
        """Switch the TV to the stored Day or Evening content_id."""
        if mode not in (SLOT_DAY, SLOT_EVENING):
            raise ValueError("Modus moet 'day' of 'evening' zijn.")
        content_id = self.slots.get(mode)
        if not content_id:
            label = "Dag" if mode == SLOT_DAY else "Avond"
            raise ValueError(
                f"Er is nog geen {label}-afbeelding geüpload via Frame Art Studio."
            )
        await self.client.async_select_art(content_id)
        await self.async_update_slots(active_mode=mode)
        return content_id


class SlotStore:
    """Home Assistant Store holding latest Day/Evening content_ids per entry."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, dict[str, Any]]] = Store(
            hass, STORAGE_VERSION, STORAGE_KEY
        )
        self._data: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        if isinstance(loaded, dict):
            self._data = loaded

    def get_slots(self, entry_id: str) -> dict[str, Any]:
        raw = self._data.get(entry_id, {})
        if not isinstance(raw, dict):
            raw = {}
        return {
            SLOT_DAY: raw.get(SLOT_DAY) if isinstance(raw.get(SLOT_DAY), str) else None,
            SLOT_EVENING: (
                raw.get(SLOT_EVENING)
                if isinstance(raw.get(SLOT_EVENING), str)
                else None
            ),
            "activeMode": (
                raw.get("activeMode")
                if raw.get("activeMode") in (SLOT_DAY, SLOT_EVENING)
                else None
            ),
            "updatedAt": raw.get("updatedAt"),
        }

    async def async_update_slots(
        self,
        entry_id: str,
        *,
        day: str | None | object = ...,
        evening: str | None | object = ...,
        active_mode: str | None | object = ...,
    ) -> dict[str, Any]:
        current = self.get_slots(entry_id)
        if day is not ...:
            current[SLOT_DAY] = day
        if evening is not ...:
            current[SLOT_EVENING] = evening
        if active_mode is not ...:
            current["activeMode"] = active_mode
        current["updatedAt"] = datetime.now().isoformat(timespec="seconds")
        self._data[entry_id] = current
        await self._store.async_save(self._data)
        return current

    async def async_remove_entry(self, entry_id: str) -> None:
        if entry_id in self._data:
            self._data.pop(entry_id, None)
            await self._store.async_save(self._data)
