"""Detection entities for Eufy Mega Security."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import EufyGatewayConfigEntry
from .coordinator import EufyGatewayCoordinator
from .entity import EufyGatewayEntity


async def async_setup_entry(
    hass: HomeAssistant, entry: EufyGatewayConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Create motion and person entities for each camera."""
    coordinator = entry.runtime_data.coordinator
    known: set[str] = set()

    def add_new() -> None:
        serials = set(coordinator.data) - known
        if serials:
            known.update(serials)
            entities = []
            for serial in sorted(serials):
                entities.extend((
                    EufyDetectionSensor(coordinator, serial, "motion"),
                    EufyDetectionSensor(coordinator, serial, "person"),
                ))
            async_add_entities(entities)

    add_new()
    entry.async_on_unload(coordinator.async_add_listener(add_new))


class EufyDetectionSensor(EufyGatewayEntity, BinarySensorEntity):
    """One transient detection signal."""

    def __init__(self, coordinator: EufyGatewayCoordinator, serial: str, kind: str) -> None:
        super().__init__(coordinator, serial)
        self.kind = kind
        self._attr_unique_id = f"{serial}_{kind}"
        self._attr_name = "Motion" if kind == "motion" else "Person"
        self._attr_device_class = (
            BinarySensorDeviceClass.MOTION if kind == "motion" else BinarySensorDeviceClass.OCCUPANCY
        )

    @property
    def is_on(self) -> bool:
        return bool(self.camera.get(f"{self.kind}Detected"))
