"""Eufy Mega Security integration."""

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
    coordinator: EufyGatewayCoordinator


EufyGatewayConfigEntry = ConfigEntry[GatewayRuntimeData]


async def async_setup_entry(hass: HomeAssistant, entry: EufyGatewayConfigEntry) -> bool:
    """Set up the gateway and its entity platforms."""
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


async def async_unload_entry(hass: HomeAssistant, entry: EufyGatewayConfigEntry) -> bool:
    """Unload the integration cleanly."""
    await entry.runtime_data.coordinator.async_shutdown()
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
