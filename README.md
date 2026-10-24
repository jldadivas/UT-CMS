# IoT Sensor Monitoring System

Expo SDK 58 + React Native + TypeScript frontend for TOF distance, calibrated light intensity, and soil moisture readings from an ESP32 through a Raspberry Pi API.

## Run in Expo Go

```sh
npm install
npm start
```

Scan the QR code with Expo Go. Keep the phone and Raspberry Pi on the same Wi-Fi network. In Settings, enter the Pi's LAN address (for example `http://192.168.1.50`), API port (default `8080`), and refresh interval. Save settings, then use **Test connection**. Use the Pi's local network address rather than `localhost` from a phone. The server must permit requests from the phone; web builds also need suitable CORS headers.

## API contract used by this app

The current endpoint is `GET http://<host>:<port>/api/readings/current`. It may return a reading directly or under a `reading` key:

```json
{
  "tof_distance_mm": 125.5,
  "light_lux": 350,
  "soil_moisture_percent": 62,
  "timestamp": "2026-10-24T10:00:00Z"
}
```

The history screen and analytics also request `GET /api/readings?limit=500`, expecting either an array of readings or `{ "readings": [...] }`. The Raspberry Pi backend must validate/store timestamped readings and serve this endpoint for persistent history. Change the route or field mapping in `src/lib/sensors.ts` to match firmware/backend choices. A successful response with at least one finite, nonnegative numeric sensor value is required for Connected status. A missing sensor field is shown as unavailable; stale-value detection depends on timestamps supplied by the API and should be enforced by the backend.

For a quick connectivity check on a laptop on the same network, open `http://<host>:<port>/api/readings/current` or run:

```sh
curl http://192.168.1.50:8080/api/readings/current
```

An unavailable server produces an error on the dashboard and a failed connection test. No sample readings are bundled.

## Project structure

- `src/app/`: dashboard, analytics, history, and settings routes.
- `src/components/sensor-ui.tsx`: reusable cards, chart, panels, and visual styles.
- `src/components/app-tabs.tsx` / `app-tabs.web.tsx`: native and web tab navigation.
- `src/lib/sensors.ts`: API requests, field validation, polling state, and session history.

## What works and backend requirements

- Works in the frontend: polling, refresh, connection/error states, configurable thresholds and polling interval, sensor condition labels, moisture progress bar, period filters, trend plots with selectable points, period min/max/average, searchable history, CSV export through the platform share sheet.
- Requires the Pi backend: actual sensor values, durable timestamped history, correct calibration/units, stale-data policy, and any authentication. Current settings and the in-memory fallback history reset when the app process restarts; server history is the durable source of truth.
