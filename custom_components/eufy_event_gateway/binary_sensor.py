"""Motion and person binary sensors for Eufy Mega Security.

The gateway holds transient detection state long enough for an SSE update to
reach Home Assistant. These entities mirror the normalized `motionDetected` and
`personDetected` fields and do not poll Eufy, decode push payloads, or infer
motion locally. Device identity and availability come from `entity.py`.
"""

from __future__ import annotations

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import EufyGatewayConfigEntry
from .coordinator import EufyGatewayCoordinator
from .entity import EufyGatewayEntity, EufyStationEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: EufyGatewayConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create motion and person entities for each camera."""
    coordinator = entry.runtime_data.coordinator
    known_cameras: set[str] = set()
    known_stations: set[str] = set()

    def add_new() -> None:
        serials = set(coordinator.cameras) - known_cameras
        if serials:
            known_cameras.update(serials)
            entities = []
            for serial in sorted(serials):
                entities.extend(
                    (
                        EufyDetectionSensor(coordinator, serial, "motion"),
                        EufyDetectionSensor(coordinator, serial, "person"),
                    )
                )
            async_add_entities(entities)

        station_serials = set(coordinator.stations) - known_stations
        if station_serials:
            known_stations.update(station_serials)
            async_add_entities(
                EufyStationConnectionSensor(coordinator, serial)
                for serial in sorted(station_serials)
            )

    add_new()
    entry.async_on_unload(coordinator.async_add_listener(add_new))


class EufyDetectionSensor(EufyGatewayEntity, BinarySensorEntity):
    """Expose one gateway detection flag as a Home Assistant binary sensor."""

    def __init__(
        self, coordinator: EufyGatewayCoordinator, serial: str, kind: str
    ) -> None:
        """Bind the sensor to a camera serial and detection kind."""
        super().__init__(coordinator, serial)
        self.kind = kind
        self._attr_unique_id = f"{serial}_{kind}"
        self._attr_name = "Motion" if kind == "motion" else "Person"
        self._attr_device_class = (
            BinarySensorDeviceClass.MOTION
            if kind == "motion"
            else BinarySensorDeviceClass.OCCUPANCY
        )

    @property
    def is_on(self) -> bool:
        """Return the current motion or person flag from coordinator data."""
        return bool(self.camera.get(f"{self.kind}Detected"))


class EufyStationConnectionSensor(EufyStationEntity, BinarySensorEntity):
    """Expose HomeBase PPCS reachability independently from inventory presence."""

    _attr_translation_key = "eufy_station_connection"
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coordinator: EufyGatewayCoordinator, serial: str) -> None:
        """Create a connectivity diagnostic for one HomeBase."""
        EufyStationEntity.__init__(self, coordinator, serial)
        BinarySensorEntity.__init__(self)
        self._attr_unique_id = f"{serial}_connection"

    @property
    def is_on(self) -> bool:
        """Return whether the gateway reports the station command channel connected."""
        return bool(self.station.get("connected"))
