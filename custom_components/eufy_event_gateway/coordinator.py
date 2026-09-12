"""Push-first state coordinator for Eufy Mega Security.

The gateway sends state changes over one long-lived SSE connection. This
coordinator applies those changes immediately and keeps a sixty-second poll as
recovery for a dropped stream or a gateway restart. It owns reconnect/backoff
and the first inventory fetch; entity code only reads the coordinator's
normalized camera dictionary and never makes a protocol request of its own.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .client import GatewayClient, GatewayClientError
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class EufyGatewayCoordinator(DataUpdateCoordinator[dict[str, dict[str, Any]]]):
    """Keep entity state current via SSE, with polling as recovery."""

    def __init__(self, hass: HomeAssistant, client: GatewayClient) -> None:
        """Create the coordinator with the gateway client and recovery interval."""
        super().__init__(
            hass,
            logger=_LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=60),
            always_update=False,
        )
        self.client = client
        self._event_task: asyncio.Task[None] | None = None

    async def _async_update_data(self) -> dict[str, dict[str, Any]]:

        # Polling is recovery only. Normal updates arrive through the long-lived
        # SSE connection started after the first successful refresh.
        try:
            cameras = await self.client.cameras()
        except GatewayClientError as error:
            raise UpdateFailed(str(error)) from error
        return {camera["serial"]: camera for camera in cameras}

    def start_event_listener(self) -> None:
        """Start one reconnecting SSE task after the first poll succeeds."""
        if self._event_task is None:
            self._event_task = self.config_entry.async_create_background_task(
                self.hass, self._listen_forever(), "Eufy gateway events"
            )

    async def async_shutdown(self) -> None:
        """Cancel the SSE task so unloading never leaves a background request."""
        if self._event_task is not None:
            self._event_task.cancel()
            await asyncio.gather(self._event_task, return_exceptions=True)
            self._event_task = None

    async def _listen_forever(self) -> None:
        """Reconnect with capped exponential backoff until Home Assistant cancels us."""
        delay = 1
        while True:
            try:
                async for event in self.client.events():
                    delay = 1
                    self._apply_event(event)
                raise GatewayClientError("Gateway event stream ended")
            except asyncio.CancelledError:
                raise
            except GatewayClientError as error:
                self.logger.debug("Gateway event stream reconnecting: %s", error)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60)
            else:
                delay = 1

    def _apply_event(self, event: dict[str, Any]) -> None:
        """Merge a full camera list or one camera update into coordinator data."""
        cameras = event.get("cameras")
        if isinstance(cameras, list):
            normalized = {
                camera["serial"]: camera
                for camera in cameras
                if isinstance(camera, dict) and isinstance(camera.get("serial"), str)
            }
            self.async_set_updated_data(normalized)
            return

        camera = event.get("camera")
        if not isinstance(camera, dict) or not isinstance(camera.get("serial"), str):
            return
        updated = dict(self.data or {})
        updated[camera["serial"]] = camera
        self.async_set_updated_data(updated)
