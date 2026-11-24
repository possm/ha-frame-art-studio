"""Sensor entities exposing the latest Day and Evening content_ids."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, MODE_LABELS, SLOT_DAY, SLOT_EVENING
from .coordinator import FrameGeneratorEntryData


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Frame Art Studio sensors for a config entry."""
    data: FrameGeneratorEntryData = hass.data[DOMAIN]["entries"][entry.entry_id]
    async_add_entities(
        [
            FrameSlotSensor(data, SLOT_DAY),
            FrameSlotSensor(data, SLOT_EVENING),
            FrameActiveArtworkSensor(data),
        ]
    )


class FrameSlotSensor(SensorEntity):
    """Sensor exposing the latest uploaded content_id for Day or Evening."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, data: FrameGeneratorEntryData, slot: str) -> None:
        self._data = data
        self._slot = slot
        label = MODE_LABELS[slot]
        self._attr_unique_id = f"{data.entry_id}_{slot}_content_id"
        self._attr_name = f"{label} content ID"
        self._attr_icon = (
            "mdi:weather-sunny" if slot == SLOT_DAY else "mdi:weather-night"
        )
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, data.host)},
            name=data.name,
            manufacturer="Samsung",
            model="The Frame (Art Mode)",
        )

    @property
    def native_value(self) -> str | None:
        return self._data.slots.get(self._slot)

    @property
    def extra_state_attributes(self) -> dict[str, str | None]:
        return {
            "host": self._data.host,
            "slot": self._slot,
            "updated_at": self._data.slots.get("updatedAt"),
        }

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._data.add_listener(self.async_write_ha_state))


class FrameActiveArtworkSensor(SensorEntity):
    """Sensor showing the content_id currently displayed on Samsung The Frame."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_name = "Actief kunstwerk"
    _attr_icon = "mdi:image-frame"

    def __init__(self, data: FrameGeneratorEntryData) -> None:
        self._data = data
        self._attr_unique_id = f"{data.entry_id}_active_artwork"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, data.host)},
            name=data.name,
            manufacturer="Samsung",
            model="The Frame (Art Mode)",
        )

    @property
    def native_value(self) -> str | None:
        return self._data.active_content_id

    @property
    def extra_state_attributes(self) -> dict[str, object]:
        matched = self._data.matched_active_slot
        return {
            "host": self._data.host,
            "mode": MODE_LABELS.get(matched) if matched else None,
            "tv_reachable": self._data.tv_reachable,
            "last_checked": self._data.last_polled,
        }

    async def async_update(self) -> None:
        """Allow manual refresh via homeassistant.update_entity."""
        await self._data.async_refresh_current_art()

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._data.add_listener(self.async_write_ha_state))
