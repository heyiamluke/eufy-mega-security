"""Constants for the Eufy Event Gateway integration."""

from homeassistant.const import Platform

DOMAIN = "eufy_event_gateway"
CONF_API_TOKEN = "api_token"
PLATFORMS = [Platform.CAMERA, Platform.BINARY_SENSOR, Platform.SENSOR]
