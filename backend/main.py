"""MQTT-to-HTTP bridge for the ESP32 sensor sketch."""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
LOG = logging.getLogger("sensor_backend")
ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
DB_PATH = Path(os.getenv("SENSOR_DB_PATH", str(ROOT / "sensor_readings.sqlite3")))
MQTT_HOST = os.getenv("MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
DATA_TOPIC = os.getenv("MQTT_DATA_TOPIC", "esp32/tof_light_soil_data")
STATUS_TOPIC = os.getenv("MQTT_STATUS_TOPIC", "esp32/tof_light_soil_status")
SOIL_DRY_RAW = os.getenv("SOIL_DRY_RAW", "").strip() or None
SOIL_WET_RAW = os.getenv("SOIL_WET_RAW", "").strip() or None

_db_lock = threading.Lock()
_mqtt_client: mqtt.Client | None = None
_mqtt_connected = threading.Event()
_last_mqtt_message: dict[str, str] = {}


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            tof_distance_mm REAL,
            light_lux REAL,
            soil_raw INTEGER,
            soil_moisture_percent REAL,
            rssi INTEGER
        )""")


def finite_number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    value = float(value)
    return value if value >= 0 and value < float("inf") else None


def soil_percent(raw: int | None) -> float | None:
    if raw is None or SOIL_DRY_RAW is None or SOIL_WET_RAW is None:
        return None
    try:
        dry, wet = float(SOIL_DRY_RAW), float(SOIL_WET_RAW)
    except ValueError:
        LOG.error("SOIL_DRY_RAW and SOIL_WET_RAW must be numbers; soil percentage is unavailable")
        return None
    if dry == wet:
        LOG.error("SOIL_DRY_RAW and SOIL_WET_RAW must differ")
        return None
    return round(max(0.0, min(100.0, (raw - dry) * 100.0 / (wet - dry))), 1)


def store_reading(payload: dict[str, Any]) -> None:
    tof = finite_number(payload.get("tof_mm"))
    lux = finite_number(payload.get("lux"))
    raw_value = payload.get("soil_raw")
    raw = raw_value if isinstance(raw_value, int) and not isinstance(raw_value, bool) and raw_value >= 0 else None
    rssi_value = payload.get("rssi")
    rssi = rssi_value if isinstance(rssi_value, int) and not isinstance(rssi_value, bool) else None
    # Ignore malformed or unrelated MQTT messages instead of recording empty rows.
    if tof is None and lux is None and raw is None:
        LOG.warning("Ignoring MQTT payload with no valid sensor values")
        return
    timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    with _db_lock, connect_db() as conn:
        conn.execute(
            "INSERT INTO readings(timestamp,tof_distance_mm,light_lux,soil_raw,soil_moisture_percent,rssi) VALUES(?,?,?,?,?,?)",
            (timestamp, tof, lux, raw, soil_percent(raw), rssi),
        )
    LOG.info("Saved sensor reading: tof_mm=%s lux=%s soil_raw=%s rssi=%s", tof, lux, raw, rssi)


def on_connect(client: mqtt.Client, _userdata: Any, _flags: Any, reason_code: Any, _properties: Any = None) -> None:
    if reason_code == 0:
        _mqtt_connected.set()
        LOG.info("Connected to MQTT broker at %s:%s", MQTT_HOST, MQTT_PORT)
        result, _mid = client.subscribe([(DATA_TOPIC, 0), (STATUS_TOPIC, 1)])
        LOG.info("Subscribed to %s and %s (result=%s)", DATA_TOPIC, STATUS_TOPIC, result)
    else:
        _mqtt_connected.clear()
        LOG.error("MQTT connection failed: %s", reason_code)


def on_disconnect(_client: mqtt.Client, _userdata: Any, _disconnect_flags: Any, reason_code: Any, _properties: Any = None) -> None:
    _mqtt_connected.clear()
    LOG.warning("Disconnected from MQTT broker (reason=%s); reconnect will be attempted", reason_code)


def on_message(_client: mqtt.Client, _userdata: Any, msg: mqtt.MQTTMessage) -> None:
    try:
        decoded = msg.payload.decode("utf-8")
        received_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        _last_mqtt_message.update(topic=msg.topic, received_at=received_at)
        LOG.info("Received MQTT message on %s (%d bytes)", msg.topic, len(msg.payload))
        if msg.topic == STATUS_TOPIC:
            LOG.info("ESP32 status: %s", decoded)
            return
        store_reading(json.loads(decoded))
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError) as exc:
        LOG.warning("Ignoring invalid MQTT message on %s: %s", msg.topic, exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _mqtt_client
    initialize_db()
    client_id = os.getenv("MQTT_CLIENT_ID", "ut-cms-python-backend")
    _mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    if MQTT_USER:
        _mqtt_client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
    _mqtt_client.on_connect = on_connect
    _mqtt_client.on_disconnect = on_disconnect
    _mqtt_client.on_message = on_message
    _mqtt_client.reconnect_delay_set(min_delay=1, max_delay=30)
    try:
        LOG.info("Starting sensor API on port 8080; broker=%s:%s data_topic=%s", MQTT_HOST, MQTT_PORT, DATA_TOPIC)
        _mqtt_client.connect_async(MQTT_HOST, MQTT_PORT, keepalive=30)
        _mqtt_client.loop_start()
    except Exception:
        LOG.exception("Could not start MQTT connection")
    yield
    if _mqtt_client:
        _mqtt_client.loop_stop()
        _mqtt_client.disconnect()


app = FastAPI(title="UT-CMS Sensor API", lifespan=lifespan)
origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["*"])


def api_reading(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "timestamp": row["timestamp"],
        "tof_distance_mm": row["tof_distance_mm"],
        "light_lux": row["light_lux"],
        "soil_raw": row["soil_raw"],
        "soil_moisture_percent": row["soil_moisture_percent"],
        "rssi": row["rssi"],
    }


@app.get("/api/readings/current")
def current_reading() -> dict[str, Any]:
    with connect_db() as conn:
        row = conn.execute("SELECT * FROM readings ORDER BY id DESC LIMIT 1").fetchone()
    return {"reading": api_reading(row) if row else None}


@app.get("/api/readings")
def reading_history(limit: int = Query(default=500, ge=1, le=5000)) -> dict[str, list[dict[str, Any]]]:
    with connect_db() as conn:
        rows = conn.execute("SELECT * FROM readings ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return {"readings": [api_reading(row) for row in rows]}


@app.get("/api/health")
def health() -> dict[str, Any]:
    with connect_db() as conn:
        count = conn.execute("SELECT COUNT(*) FROM readings").fetchone()[0]
    return {
        "status": "ok",
        "mqtt_connected": _mqtt_connected.is_set(),
        "mqtt_broker": f"{MQTT_HOST}:{MQTT_PORT}",
        "mqtt_data_topic": DATA_TOPIC,
        "mqtt_status_topic": STATUS_TOPIC,
        "last_mqtt_message": _last_mqtt_message or None,
        "stored_readings": count,
    }
