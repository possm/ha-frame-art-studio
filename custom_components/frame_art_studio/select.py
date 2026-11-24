"""Select entity to switch The Frame between the stored Day and Evening artworks."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, LABEL_TO_SLOT, MODE_LABELS, SLOT_DAY, SLOT_EVENING
from .coordinator import FrameGeneratorEntryData


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Frame Art Studio mode select entity."""
    data: FrameGeneratorEntryData = hass.data[DOMAIN]["entries"][entry.entry_id]
    async_add_entities([FrameModeSelect(data)])


class FrameModeSelect(SelectEntity):
    """Switch Samsung The Frame Art Mode between the latest Dag and Avond artworks."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_name = "Art modus"
    _attr_icon = "mdi:image-frame"
    _attr_options = [MODE_LABELS[SLOT_DAY], MODE_LABELS[SLOT_EVENING]]

    def __init__(self, data: FrameGeneratorEntryData) -> None:
        self._data = data
        self._attr_unique_id = f"{data.entry_id}_art_mode"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, data.host)},
            name=data.name,
            manufacturer="Samsung",
            model="The Frame (Art Mode)",
        )

    @property
    def current_option(self) -> str | None:
        mode = self._data.active_mode
        return MODE_LABELS.get(mode) if mode else None

    @property
    def extra_state_attributes(self) -> dict[str, str | None]:
        return {
            "day_content_id": self._data.slots.get(SLOT_DAY),
            "evening_content_id": self._data.slots.get(SLOT_EVENING),
            "host": self._data.host,
        }

    async def async_select_option(self, option: str) -> None:
        slot = LABEL_TO_SLOT.get(option)
        if not slot:
            raise ValueError(f"Onbekende modus: {option}")
        await self._data.async_select_mode(slot)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._data.add_listener(self.async_write_ha_state))
