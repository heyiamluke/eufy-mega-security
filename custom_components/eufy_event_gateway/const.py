"""Stable Home Assistant identifiers for Eufy Mega Security.

The domain remains `eufy_event_gateway` for installed-entry compatibility even
though the user-facing project and integration name is Eufy Mega Security.
These constants are the shared keys used by the config flow, coordinator, and
platform setup; changing them can orphan existing Home Assistant entries.
"""

from homeassistant.const import Platform

DOMAIN = "eufy_event_gateway"
CONF_API_TOKEN = "api_token"
PLATFORMS = [Platform.CAMERA, Platform.BINARY_SENSOR, Platform.SENSOR]
