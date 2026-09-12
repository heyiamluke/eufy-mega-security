"""Shared entity support for Eufy Mega Security.

All platforms use the same serial-based device identity and coordinator lookup.
Keeping this mapping here prevents camera, binary-sensor, and person entities
from inventing different names or availability rules for the same physical
camera. The serial is the gateway's stable key, not an entity ID selected by
Home Assistant's UI.
"""

from __future__ import annotations

from typing import Any

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import EufyGatewayCoordinator


class EufyGatewayEntity(CoordinatorEntity[EufyGatewayCoordinator]):
    """Base class that maps one Home Assistant entity to one gateway camera."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: EufyGatewayCoordinator, serial: str) -> None:
        """Bind the entity to a stable camera serial from gateway state."""
        super().__init__(coordinator)
        self.serial = serial

    @property
    def camera(self) -> dict[str, Any]:
        """Return the latest camera dictionary, or an empty value while absent."""
        return self.coordinator.data.get(self.serial, {})

    @property
    def available(self) -> bool:
        """Stay unavailable until the coordinator has data for this camera."""
        return super().available and bool(self.camera)

    @property
    def device_info(self) -> DeviceInfo:
        """Use the camera serial as the stable Home Assistant device identifier."""
        return DeviceInfo(
            identifiers={(DOMAIN, self.serial)},
            name=self.camera.get("name") or f"Eufy camera {self.serial[-4:]}",
            manufacturer="Eufy",
            model=self.camera.get("model"),
        )
