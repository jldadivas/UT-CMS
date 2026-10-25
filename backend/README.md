# Python MQTT backend

This service subscribes to the topics in `esp32_mqtt_tof_light_soil.ino`, stores each sensor message in SQLite, and exposes the HTTP API consumed by the Expo app. It runs on Windows for development and Raspberry Pi OS (64-bit) on the Pi 5.

## Install and run

Install Python 3.10 or newer and a Mosquitto MQTT broker. The ESP32's `MQTT_BROKER` must be the LAN IP of the computer running Mosquitto; do not leave `YOUR_RASPBERRY_PI_IP` in the sketch. The Python service and ESP32 must connect to the same broker.

From this directory, in PowerShell:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8080
```

On Raspberry Pi OS:

```sh
sudo apt update
sudo apt install -y python3-venv mosquitto mosquitto-clients
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8080
```

Set `MQTT_HOST` to `127.0.0.1` if Mosquitto runs on the same device. If Mosquitto is elsewhere, set it to that broker's address. Configure the same optional broker username/password on the broker, ESP32 sketch, and backend `.env`. Permit inbound TCP 1883 from the ESP32 and TCP 8080 from phones on the LAN. In the app Settings, set the API address to the backend machine's LAN IP and port `8080`.

The backend loads values from the local `.env` file; process environment variables take precedence. For a systemd deployment, you can also set variables through the unit's `Environment=` entries.

## Soil calibration

The firmware publishes `soil_raw`, not a percentage. The current calibration maps dry raw value `2527` to 0% and wet raw value `1237` to 100%. The service linearly maps between them, clamps intermediate values, and retains the raw value in the API. Reversed sensor polarity is supported. To recalibrate, set `SOIL_DRY_RAW` and `SOIL_WET_RAW` in `.env` and restart the service.

## MQTT mapping and API

The service subscribes to `esp32/tof_light_soil_data` and `esp32/tof_light_soil_status`. Data messages are expected to look like:

```json
{"tof_mm":125,"tof_cm":12.5,"lux":350.0,"soil_raw":2100,"rssi":-55}
```

`tof_mm` maps to `tof_distance_mm`, `lux` to `light_lux`, and `soil_raw` remains available alongside calibrated `soil_moisture_percent`. Missing/null sensor values remain null. The status topic is logged (the ESP32 publishes retained `online` and its Last Will is `offline`).

- `GET /api/readings/current` returns `{ "reading": ... }`, or `{ "reading": null }` before the first MQTT reading.
- `GET /api/readings?limit=500` returns `{ "readings": [...] }`, newest first.
- `GET /api/health` reports HTTP status, MQTT connection state, broker/topic settings, the last MQTT message time/topic, and how many readings are stored.

The terminal running Uvicorn prints a startup line with the broker and topic, logs when MQTT connects/subscribes, and logs each message received and reading saved. If the app test fails, open `http://<pi-ip>:8080/api/health` from a device on the same Wi-Fi. If `mqtt_connected` is false, check `MQTT_HOST`/credentials and the Mosquitto service. If it is true but `last_mqtt_message` is null, check that the sketch publishes to the same broker and `MQTT_DATA_TOPIC`. If `last_mqtt_message` advances and `stored_readings` increases, but the app fails, check the app's server IP and port (8080) and that TCP 8080 is allowed through the Pi firewall.

SQLite data is stored at `backend/sensor_readings.sqlite3` by default. Set `SENSOR_DB_PATH` to a persistent path when deploying. No Expo or firmware route changes are needed.
