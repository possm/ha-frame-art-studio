"""Frame Art Studio Home Assistant custom integration."""

from __future__ import annotations

from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from .const import (
    CONF_HOST,
    CONF_NAME,
    CONF_SHOW_SIDEBAR,
    DEFAULT_NAME,
    DEFAULT_SHOW_SIDEBAR,
    DOMAIN,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    PLATFORMS,
    SERVICE_SELECT_MODE,
    STATIC_URL_PATH,
    VALID_SLOTS,
)
from .coordinator import FrameGeneratorEntryData, SlotStore
from .http_views import (
    FrameConfigView,
    FrameDeleteView,
    FrameLibraryView,
    FrameSelectView,
    FrameUploadView,
)
from .tv import FrameTVClient

SERVICE_SCHEMA = vol.Schema(
    {
        vol.Required("mode"): vol.In(VALID_SLOTS),
        vol.Optional("host"): cv.string,
    }
)


async def _async_ensure_domain_setup(hass: HomeAssistant) -> dict:
    """Register shared HTTP views, static frontend path, store, and services once."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get("initialized"):
        return domain_data

    store = SlotStore(hass)
    await store.async_load()
    domain_data["store"] = store
    domain_data["entries"] = {}
    domain_data["panel_registered"] = False

    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                STATIC_URL_PATH,
                str(frontend_dir),
                cache_headers=False,
            )
        ]
    )

    hass.http.register_view(FrameConfigView())
    hass.http.register_view(FrameUploadView())
    hass.http.register_view(FrameLibraryView())
    hass.http.register_view(FrameSelectView())
    hass.http.register_view(FrameDeleteView())

    async def _handle_select_mode(call: ServiceCall) -> None:
        mode: str = call.data["mode"]
        target_host: str | None = call.data.get("host")
        entries: dict[str, FrameGeneratorEntryData] = domain_data["entries"]
        target = None
        if target_host:
            for item in entries.values():
                if item.host == target_host.strip():
                    target = item
                    break
        elif entries:
            target = next(iter(entries.values()))

        if target is None:
            raise HomeAssistantError("Geen geconfigureerde Samsung The Frame gevonden.")
        try:
            await target.async_select_mode(mode)
        except Exception as err:
            raise HomeAssistantError(str(err)) from err

    hass.services.async_register(
        DOMAIN,
        SERVICE_SELECT_MODE,
        _handle_select_mode,
        schema=SERVICE_SCHEMA,
    )

    domain_data["initialized"] = True
    return domain_data


async def _async_sync_sidebar_panel(hass: HomeAssistant, domain_data: dict) -> None:
    """Register or remove the Home Assistant sidebar panel based on active entries."""
    entries: dict[str, FrameGeneratorEntryData] = domain_data["entries"]
    wants_panel = any(
        hass.config_entries.async_get_entry(eid) is not None
        and hass.config_entries.async_get_entry(eid).data.get(
            CONF_SHOW_SIDEBAR, DEFAULT_SHOW_SIDEBAR
        )
        for eid in entries
    )

    if wants_panel and not domain_data.get("panel_registered"):
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name="frame-art-studio-panel",
            frontend_url_path=PANEL_URL_PATH,
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            module_url=f"{STATIC_URL_PATH}/panel.js",
            embed_iframe=False,
            require_admin=False,
        )
        domain_data["panel_registered"] = True
    elif not wants_panel and domain_data.get("panel_registered"):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
        domain_data["panel_registered"] = False


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Frame Art Studio from a config entry."""
    domain_data = await _async_ensure_domain_setup(hass)
    host: str = entry.data[CONF_HOST]
    name: str = entry.data.get(CONF_NAME, DEFAULT_NAME)
    token_dir = Path(hass.config.path(".storage", f"{DOMAIN}_tokens"))

    client = FrameTVClient(hass, host, token_dir)
    entry_data = FrameGeneratorEntryData(
        hass=hass,
        entry_id=entry.entry_id,
        name=name,
        host=host,
        client=client,
        store=domain_data["store"],
    )
    domain_data["entries"][entry.entry_id] = entry_data

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await _async_sync_sidebar_panel(hass, domain_data)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        domain_data = hass.data.get(DOMAIN, {})
        domain_data.get("entries", {}).pop(entry.entry_id, None)
        await _async_sync_sidebar_panel(hass, domain_data)
    return unload_ok


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Clean up stored slots when a config entry is removed."""
    domain_data = hass.data.get(DOMAIN, {})
    store: SlotStore | None = domain_data.get("store")
    if store is not None:
        await store.async_remove_entry(entry.entry_id)
