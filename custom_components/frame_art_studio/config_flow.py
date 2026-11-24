"""Config flow for Frame Art Studio."""

from __future__ import annotations

import html
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import (
    CONF_HOST,
    CONF_NAME,
    CONF_SHOW_SIDEBAR,
    DEFAULT_HOST,
    DEFAULT_NAME,
    DEFAULT_SHOW_SIDEBAR,
    DOMAIN,
)
from .tv import fetch_tv_device_info, validate_host


class FrameGeneratorConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Frame Art Studio."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            raw_host = user_input.get(CONF_HOST, "")
            try:
                host = validate_host(raw_host)
            except ValueError:
                errors[CONF_HOST] = "invalid_host"
            else:
                await self.async_set_unique_id(host)
                self._abort_if_unique_id_configured()

                detected_name = (user_input.get(CONF_NAME) or "").strip()
                try:
                    info = await self.hass.async_add_executor_job(
                        fetch_tv_device_info, host
                    )
                    device = info.get("device", {}) if isinstance(info, dict) else {}
                    tv_name = html.unescape(str(device.get("name") or "")).strip()
                    if not detected_name and tv_name:
                        detected_name = tv_name
                except Exception:
                    # Allow saving even if the TV is currently in deep standby
                    pass

                final_name = detected_name or DEFAULT_NAME
                return self.async_create_entry(
                    title=final_name,
                    data={
                        CONF_HOST: host,
                        CONF_NAME: final_name,
                        CONF_SHOW_SIDEBAR: bool(
                            user_input.get(CONF_SHOW_SIDEBAR, DEFAULT_SHOW_SIDEBAR)
                        ),
                    },
                )

        schema = vol.Schema(
            {
                vol.Required(CONF_HOST, default=DEFAULT_HOST): str,
                vol.Optional(CONF_NAME, default=DEFAULT_NAME): str,
                vol.Optional(CONF_SHOW_SIDEBAR, default=DEFAULT_SHOW_SIDEBAR): bool,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)
