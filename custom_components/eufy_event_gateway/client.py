"""Small async client for the local Eufy gateway."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from aiohttp import ClientError, ClientResponseError, ClientSession, ClientTimeout


class GatewayClientError(Exception):
    """The gateway could not satisfy a request."""


class GatewayAuthenticationError(GatewayClientError):
    """The gateway rejected the configured token."""


class GatewayClient:
    """Access the gateway without retaining Eufy credentials in Home Assistant."""

    def __init__(self, session: ClientSession, base_url: str, api_token: str = "") -> None:
        self._session = session
        self.base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_token}"} if api_token else {}

    async def cameras(self) -> list[dict[str, Any]]:
        """Fetch the complete normalized camera state."""
        payload = await self._json("/api/cameras")
        cameras = payload.get("cameras")
        if not isinstance(cameras, list):
            raise GatewayClientError("Gateway returned an invalid camera list")
        return [camera for camera in cameras if isinstance(camera, dict) and isinstance(camera.get("serial"), str)]

    async def snapshot(self, serial: str) -> bytes | None:
        """Fetch the last good still without waking an idle camera."""
        try:
            async with self._session.get(
                self._url(f"/api/cameras/{serial}/snapshot"), headers=self._headers
            ) as response:
                if response.status == 404:
                    return None
                self._raise_for_status(response)
                return await response.read()
        except (ClientError, TimeoutError) as error:
            raise GatewayClientError(str(error)) from error

    async def stream_url(self, serial: str) -> str:
        """Create a short-lived on-demand H.264 stream URL for Home Assistant's FFmpeg process."""
        payload = await self._json(f"/api/cameras/{serial}/stream-token", method="POST")
        path = payload.get("path")
        if not isinstance(path, str) or not path.startswith("/"):
            raise GatewayClientError("Gateway returned an invalid stream path")
        return self._url(path)

    async def capture_snapshot(self, serial: str) -> None:
        """Wake a supported camera and wait for a newly decoded frame."""
        await self._json(f"/api/cameras/{serial}/capture-snapshot", method="POST")

    async def record_clip(self, serial: str, duration: int) -> bytes:
        """Wake a supported camera and return a bounded MP4 recording."""
        try:
            async with self._session.post(
                self._url(f"/api/cameras/{serial}/record.mp4"),
                headers=self._headers,
                json={"duration": duration},
                timeout=ClientTimeout(total=duration + 50),
            ) as response:
                self._raise_for_status(response)
                data = await response.read()
                if len(data) < 12 or data[4:8] != b"ftyp":
                    raise GatewayClientError("Gateway returned an invalid MP4 recording")
                return data
        except (ClientError, TimeoutError) as error:
            if isinstance(error, GatewayClientError):
                raise
            raise GatewayClientError(str(error)) from error

    async def events(self) -> AsyncIterator[dict[str, Any]]:
        """Yield normalized gateway events from its server-sent event stream."""
        try:
            async with self._session.get(
                self._url("/api/events"), headers=self._headers, timeout=None
            ) as response:
                self._raise_for_status(response)
                data_lines: list[str] = []
                async for raw_line in response.content:
                    line = raw_line.decode("utf-8").rstrip("\r\n")
                    if line == "":
                        if data_lines:
                            try:
                                value = json.loads("\n".join(data_lines))
                            except json.JSONDecodeError:
                                value = None
                            if isinstance(value, dict):
                                yield value
                        data_lines.clear()
                    elif line.startswith("data:"):
                        data_lines.append(line[5:].lstrip())
        except (ClientError, TimeoutError) as error:
            if isinstance(error, GatewayClientError):
                raise
            raise GatewayClientError(str(error)) from error

    async def _json(self, path: str, method: str = "GET") -> dict[str, Any]:
        try:
            async with self._session.request(method, self._url(path), headers=self._headers) as response:
                self._raise_for_status(response)
                payload = await response.json()
                if not isinstance(payload, dict):
                    raise GatewayClientError("Gateway returned an invalid response")
                return payload
        except (ClientError, TimeoutError) as error:
            if isinstance(error, GatewayClientError):
                raise
            raise GatewayClientError(str(error)) from error

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    @staticmethod
    def _raise_for_status(response: Any) -> None:
        if response.status == 401:
            raise GatewayAuthenticationError("Gateway rejected the API token")
        try:
            response.raise_for_status()
        except ClientResponseError as error:
            raise GatewayClientError(f"Gateway returned HTTP {error.status}") from error
