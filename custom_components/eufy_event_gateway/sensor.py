"""Last-recognized-person sensors for Eufy Mega Security.

The gateway keeps the last detection because a person event is transient. The
sensor reports a name only when Eufy marked the detection as recognized and
exposes the event kind and timestamp as attributes for automations. It does
not perform recognition itself and deliberately leaves generic labels such as
`Someone` unknown.
"""

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
    """Expose the last recognized person while retaining detection metadata."""

    _attr_name = "Last recognized person"
    _attr_icon = "mdi:face-recognition"

    def __init__(self, coordinator: EufyGatewayCoordinator, serial: str) -> None:
        """Create a stable person sensor for one camera."""
        super().__init__(coordinator, serial)
        self._attr_unique_id = f"{serial}_last_recognized_person"

    @property
    def native_value(self) -> str | None:
        """Return the recognized name, or None for motion/unknown detections."""
        detection = self.camera.get("lastDetection") or {}
        return detection.get("personName") if detection.get("recognized") else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose the normalized event kind, time, and recognition flag."""
        detection = self.camera.get("lastDetection") or {}
        return {
            "detection_kind": detection.get("kind"),
            "detected_at": detection.get("occurredAt"),
            "recognized": bool(detection.get("recognized")),
        }
