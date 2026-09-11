"""Recognized-person entities for the Eufy Event Gateway."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import EufyGatewayConfigEntry
from .coordinator import EufyGatewayCoordinator
from .entity import EufyGatewayEntity


async def async_setup_entry(
    hass: HomeAssistant, entry: EufyGatewayConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Create remembered detection entities for each camera."""
    coordinator = entry.runtime_data.coordinator
    known: set[str] = set()

    def add_new() -> None:
        serials = set(coordinator.data) - known
        if serials:
            known.update(serials)
            async_add_entities(EufyRecognizedPersonSensor(coordinator, serial) for serial in sorted(serials))

    add_new()
    entry.async_on_unload(coordinator.async_add_listener(add_new))


class EufyRecognizedPersonSensor(EufyGatewayEntity, SensorEntity):
    """Remember the last detection and expose a name only when Eufy supplied one."""

    _attr_name = "Last recognized person"
    _attr_icon = "mdi:face-recognition"

    def __init__(self, coordinator: EufyGatewayCoordinator, serial: str) -> None:
        super().__init__(coordinator, serial)
        self._attr_unique_id = f"{serial}_last_recognized_person"

    @property
    def native_value(self) -> str | None:
        detection = self.camera.get("lastDetection") or {}
        return detection.get("personName") if detection.get("recognized") else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        detection = self.camera.get("lastDetection") or {}
        return {
            "detection_kind": detection.get("kind"),
            "detected_at": detection.get("occurredAt"),
            "recognized": bool(detection.get("recognized")),
        }
