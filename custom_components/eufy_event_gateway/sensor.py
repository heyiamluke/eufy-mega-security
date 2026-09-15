"""Last-recognized-person sensors for Eufy Mega Security.

The gateway keeps the last detection because a person event is transient. The
sensor reports a name only when Eufy marked the detection as recognized and
exposes the event kind and timestamp as attributes for automations. It does
not perform recognition itself and deliberately leaves generic labels such as
`Someone` unknown.
"""

from __future__ import annotations

from typing import Any, ClassVar

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.const import UnitOfInformation
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import EufyGatewayConfigEntry
from .const import DOMAIN, GUARD_MODES
from .coordinator import EufyGatewayCoordinator
from .entity import EufyGatewayEntity, EufyStationEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: EufyGatewayConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create remembered detection entities for each camera."""
    coordinator = entry.runtime_data.coordinator
    known_cameras: set[str] = set()
    known_stations: set[str] = set()
    _migrate_storage_display_units(hass, coordinator)

    def add_new() -> None:
        serials = set(coordinator.cameras) - known_cameras
        if serials:
            known_cameras.update(serials)
            async_add_entities(
                EufyRecognizedPersonSensor(coordinator, serial)
                for serial in sorted(serials)
            )

        station_serials = set(coordinator.stations) - known_stations
        if station_serials:
            known_stations.update(station_serials)
            entities = []
            for serial in sorted(station_serials):
                entities.extend(
                    (
                        EufyEffectiveModeSensor(coordinator, serial),
                        EufyStorageSensor(coordinator, serial, "emmc", "totalBytes"),
                        EufyStorageSensor(coordinator, serial, "emmc", "freeBytes"),
                        EufyStorageStatusSensor(coordinator, serial, "emmc"),
                        EufyStorageSensor(coordinator, serial, "hdd", "totalBytes"),
                        EufyStorageSensor(coordinator, serial, "hdd", "freeBytes"),
                        EufyStorageStatusSensor(coordinator, serial, "hdd"),
                    )
                )
            async_add_entities(entities)

    add_new()
    entry.async_on_unload(coordinator.async_add_listener(add_new))


def _migrate_storage_display_units(
    hass: HomeAssistant, coordinator: EufyGatewayCoordinator
) -> None:
    """Replace the earlier byte suggestion while preserving user unit choices."""
    registry = er.async_get(hass)
    for serial in coordinator.stations:
        for medium in ("emmc", "hdd"):
            for property_name in ("totalBytes", "freeBytes"):
                unique_id = f"{serial}_{medium}_{property_name}"
                entity_id = registry.async_get_entity_id("sensor", DOMAIN, unique_id)
                if entity_id is None:
                    continue
                registry_entry = registry.async_get(entity_id)
                private_options = (
                    registry_entry.options.get("sensor.private", {})
                    if registry_entry is not None
                    else {}
                )
                if (
                    private_options.get("suggested_unit_of_measurement")
                    != UnitOfInformation.BYTES
                ):
                    continue
                registry.async_update_entity_options(
                    entity_id,
                    "sensor.private",
                    {"suggested_unit_of_measurement": UnitOfInformation.GIGABYTES},
                )


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


class EufyEffectiveModeSensor(EufyStationEntity, SensorEntity):
    """Expose the current effective mode independently of configured policy."""

    _attr_translation_key = "eufy_effective_mode_sensor"
    _attr_icon = "mdi:shield-check"
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options: ClassVar[list[str]] = list(GUARD_MODES.values())

    def __init__(self, coordinator: EufyGatewayCoordinator, serial: str) -> None:
        """Create the effective-mode sensor for one HomeBase."""
        EufyStationEntity.__init__(self, coordinator, serial)
        SensorEntity.__init__(self)
        self._attr_unique_id = f"{serial}_effective_mode"

    @property
    def native_value(self) -> str | None:
        """Return the Eufy label for the active effective mode."""
        value = self.station.get("effectiveMode")
        return GUARD_MODES.get(value) if isinstance(value, int) else None


class EufyStorageSensor(EufyStationEntity, SensorEntity):
    """Expose total or free capacity for one HomeBase storage medium."""

    _attr_device_class = SensorDeviceClass.DATA_SIZE
    _attr_native_unit_of_measurement = UnitOfInformation.GIGABYTES
    _attr_suggested_display_precision = 2
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(
        self,
        coordinator: EufyGatewayCoordinator,
        serial: str,
        medium: str,
        property_name: str,
    ) -> None:
        """Create a storage capacity sensor for eMMC or HDD."""
        EufyStationEntity.__init__(self, coordinator, serial)
        SensorEntity.__init__(self)
        self.medium = medium
        self.property_name = property_name
        label = "Total" if property_name == "totalBytes" else "Free"
        medium_label = "eMMC" if medium == "emmc" else "HDD"
        self._attr_name = f"{medium_label} {label}"
        self._attr_unique_id = f"{serial}_{medium}_{property_name}"

    @property
    def native_value(self) -> float | None:
        """Return capacity in gigabytes, or unknown when the medium is absent."""
        storage = self.station.get("storage") or {}
        medium = storage.get(self.medium) or {}
        value = medium.get(self.property_name)
        return value / 1_000_000_000 if isinstance(value, (int, float)) else None


class EufyStorageStatusSensor(EufyStationEntity, SensorEntity):
    """Expose the gateway-reported status of one HomeBase storage medium."""

    _attr_icon = "mdi:harddisk"
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(
        self, coordinator: EufyGatewayCoordinator, serial: str, medium: str
    ) -> None:
        """Create a storage status sensor for eMMC or HDD."""
        EufyStationEntity.__init__(self, coordinator, serial)
        SensorEntity.__init__(self)
        self.medium = medium
        medium_label = "eMMC" if medium == "emmc" else "HDD"
        self._attr_name = f"{medium_label} status"
        self._attr_unique_id = f"{serial}_{medium}_status"

    @property
    def native_value(self) -> str | None:
        """Return the reported storage status, or unknown when absent."""
        storage = self.station.get("storage") or {}
        medium = storage.get(self.medium) or {}
        value = medium.get("status")
        return value if isinstance(value, str) else None
