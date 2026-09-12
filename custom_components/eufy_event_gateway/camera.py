"""Camera entities backed by retained images and gateway-owned live streams."""

from __future__ import annotations

import os
from pathlib import Path
import tempfile

import voluptuous as vol
from homeassistant.components.camera import Camera, CameraEntityFeature
from homeassistant.const import ATTR_ENTITY_ID, CONF_FILENAME
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.entity_platform import AddEntitiesCallback, async_get_current_platform

from . import EufyGatewayConfigEntry
from .client import GatewayClientError
from .coordinator import EufyGatewayCoordinator
from .entity import EufyGatewayEntity

CONF_DURATION = "duration"


async def async_setup_entry(
    hass: HomeAssistant, entry: EufyGatewayConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Create cameras now and when a push-only camera first appears."""
    coordinator = entry.runtime_data.coordinator
    known: set[str] = set()

    def add_new() -> None:
        serials = set(coordinator.data) - known
        if serials:
            known.update(serials)
            async_add_entities(EufyGatewayCamera(coordinator, serial) for serial in sorted(serials))

    add_new()
    entry.async_on_unload(coordinator.async_add_listener(add_new))

    platform = async_get_current_platform()
    platform.async_register_entity_service(
        "capture_snapshot",
        {vol.Required(CONF_FILENAME): cv.string},
        "async_capture_snapshot",
    )
    platform.async_register_entity_service(
        "record_clip",
        {
            vol.Required(CONF_FILENAME): cv.string,
            vol.Optional(CONF_DURATION, default=15): vol.All(vol.Coerce(int), vol.Range(min=1, max=120)),
        },
        "async_record_clip",
    )


class EufyGatewayCamera(EufyGatewayEntity, Camera):
    """On-demand live camera with a durable idle image."""

    _attr_name = None
    _attr_content_type = "image/jpeg"

    def __init__(self, coordinator: EufyGatewayCoordinator, serial: str) -> None:
        EufyGatewayEntity.__init__(self, coordinator, serial)
        Camera.__init__(self)
        self._attr_unique_id = f"{serial}_camera"

    @property
    def supported_features(self) -> CameraEntityFeature:
        if self.camera.get("streamSupported"):
            return CameraEntityFeature.STREAM
        return CameraEntityFeature(0)

    @property
    def is_streaming(self) -> bool:
        return self.camera.get("stream", {}).get("state") == "streaming"

    async def async_camera_image(self, width: int | None = None, height: int | None = None) -> bytes | None:
        # Home Assistant calls this for the card image. It is intentionally a
        # cheap retained-image read and does not wake a sleeping camera.
        try:
            return await self.coordinator.client.snapshot(self.serial)
        except GatewayClientError:
            return None

    async def stream_source(self) -> str | None:
        # The gateway returns a short-lived signed URL. Home Assistant's media
        # pipeline consumes it without receiving the gateway bearer token.
        if not self.camera.get("streamSupported"):
            return None
        return await self.coordinator.client.stream_url(self.serial)

    async def async_capture_snapshot(self, filename: str) -> None:
        """Wake the camera, wait for a fresh frame, and save it through Home Assistant."""
        if not self.camera.get("streamSupported"):
            raise HomeAssistantError("Fresh snapshot capture is unavailable for this camera")
        await self.coordinator.client.capture_snapshot(self.serial)
        await self.hass.services.async_call(
            "camera",
            "snapshot",
            {ATTR_ENTITY_ID: self.entity_id, CONF_FILENAME: filename},
            blocking=True,
        )

    async def async_record_clip(self, filename: str, duration: int) -> None:
        """Record an on-demand clip through the gateway and save it atomically."""
        if not self.camera.get("streamSupported"):
            raise HomeAssistantError("Clip recording is unavailable for this camera")
        if not self.hass.config.is_allowed_path(filename):
            raise HomeAssistantError(f"Cannot write recording to {filename}; no access to path")
        try:
            data = await self.coordinator.client.record_clip(self.serial, duration)
            await self.hass.async_add_executor_job(_atomic_write, filename, data)
        except (GatewayClientError, OSError) as error:
            raise HomeAssistantError(f"Could not record clip: {error}") from error


def _atomic_write(filename: str, data: bytes) -> None:
    """Replace a recording only after the complete MP4 has been written."""
    target = Path(filename)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=target.parent,
        prefix=f".{target.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(descriptor, "wb") as temporary_file:
            temporary_file.write(data)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_name, target)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise
