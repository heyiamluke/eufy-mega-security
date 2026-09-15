"""Home Assistant entry point for Eufy Mega Security.

This package keeps Home Assistant deliberately thin. The add-on gateway owns
Eufy authentication, event decoding, snapshot persistence, and media sessions.
The integration creates one authenticated HTTP/SSE client and one coordinator,
forwards the camera, detection, HomeBase security, settings, and diagnostic
platforms, and listens for normalized gateway updates. It never stores the
Eufy account password or reimplements a Mega endpoint.
"""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .client import GatewayClient
from .const import CONF_API_TOKEN, PLATFORMS
from .coordinator import EufyGatewayCoordinator


@dataclass
class GatewayRuntimeData:
    """Objects that must live for the lifetime of one config entry."""

    coordinator: EufyGatewayCoordinator


EufyGatewayConfigEntry = ConfigEntry[GatewayRuntimeData]


async def async_setup_entry(hass: HomeAssistant, entry: EufyGatewayConfigEntry) -> bool:
    """Connect to the local gateway before creating any entities."""
    client = GatewayClient(
        async_get_clientsession(hass),
        entry.data["url"],
        entry.data.get(CONF_API_TOKEN, ""),
    )
    coordinator = EufyGatewayCoordinator(hass, client)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = GatewayRuntimeData(coordinator)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    coordinator.start_event_listener()
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: EufyGatewayConfigEntry
) -> bool:
    """Cancel the SSE listener and unload all entity platforms."""
    await entry.runtime_data.coordinator.async_shutdown()
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
