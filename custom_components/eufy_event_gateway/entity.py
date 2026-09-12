"""Shared entity support for Eufy Mega Security."""

from __future__ import annotations

from typing import Any

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import EufyGatewayCoordinator


class EufyGatewayEntity(CoordinatorEntity[EufyGatewayCoordinator]):
    """Base entity tied to one gateway camera."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: EufyGatewayCoordinator, serial: str) -> None:
        super().__init__(coordinator)
        self.serial = serial

    @property
    def camera(self) -> dict[str, Any]:
        return self.coordinator.data.get(self.serial, {})

    @property
    def available(self) -> bool:
        return super().available and bool(self.camera)

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self.serial)},
            name=self.camera.get("name") or f"Eufy camera {self.serial[-4:]}",
            manufacturer="Eufy",
            model=self.camera.get("model"),
        )
