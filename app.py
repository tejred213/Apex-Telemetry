#!/usr/bin/env python3
"""
F1 Sector Analysis — Flask API Backend (Pre-computed Data)

Serves pre-computed JSON data from the data/ directory.
No FastF1 dependency at runtime — all responses are instant.
"""

import json
import os
import math
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

_frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
app = Flask(
    __name__,
    static_folder=_frontend_dist,
    static_url_path="",
)
CORS(app)

DATA_DIR = Path(__file__).resolve().parent / "data"

# Team colour fallbacks
TEAM_COLORS_FALLBACK = {
    "Red Bull Racing": "#1E41FF",
    "Red Bull": "#3671C6",
    "Mercedes": "#00D2BE",
    "McLaren": "#FF8700",
    "Ferrari": "#DC0000",
    "Alpine": "#0090FF",
    "Alpine F1 Team": "#0090FF",
    "AlphaTauri": "#2B4562",
    "RB": "#6692FF",
    "Aston Martin": "#006F62",
    "Williams": "#005AFF",
    "Alfa Romeo": "#900000",
    "Alfa Romeo Racing": "#900000",
    "Kick Sauber": "#52E252",
    "Sauber": "#52E252",
    "Haas F1 Team": "#B6BABD",
    "Racing Point": "#F596C8",
    "Renault": "#FFF500",
    "Toro Rosso": "#469BFF",
}


# ---------------------------------------------------------------------------
# Data loading helpers
# ---------------------------------------------------------------------------

def _find_gp_dir(year: int, gp: str) -> Path | None:
    """Find the GP directory matching a GP name (fuzzy match)."""
    year_dir = DATA_DIR / str(year)
    if not year_dir.exists():
        return None

    gp_lower = gp.lower().replace(" ", "_").replace("'", "").replace(".", "")

    # Try exact match first
    for d in year_dir.iterdir():
        if d.is_dir() and d.name.lower() == gp_lower:
            return d

    # Fuzzy: check if any directory contains the search term
    for d in year_dir.iterdir():
        if d.is_dir() and (gp_lower in d.name.lower() or d.name.lower() in gp_lower):
            return d

    # Try matching by GP name from session.json
    for d in year_dir.iterdir():
        if d.is_dir():
            sfile = d / "session.json"
            if sfile.exists():
                sess = json.loads(sfile.read_text())
                if gp.lower() in sess.get("gp", "").lower():
                    return d

    return None


def _read_json(path: Path) -> dict | list | None:
    """Read a JSON file, return None if not found."""
    if path.exists():
        return json.loads(path.read_text())
    return None


def _get_color(drivers_list: list, driver_abbr: str) -> str:
    """Get team color for a driver from the session data."""
    for d in drivers_list:
        if d["driver"] == driver_abbr:
            c = d.get("color", "#FFFFFF")
            if c in ("#FFFFFF", "#FFF", "#ffffff"):
                c = TEAM_COLORS_FALLBACK.get(d.get("team", ""), "#FFFFFF")
            return c
    return "#FFFFFF"


def _get_color_pair(drivers_list: list, d1: str, d2: str):
    """Get a pair of distinct colors for two drivers."""
    c1 = _get_color(drivers_list, d1)
    c2 = _get_color(drivers_list, d2)
    if c1 == c2:
        c1, c2 = "#1E41FF", "#E10600"
    return c1, c2


def _parse_session_params():
    year = request.args.get("year", 2024, type=int)
    gp = request.args.get("gp", "Bahrain", type=str)
    return year, gp


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.route("/api/schedule", methods=["GET"])
def api_schedule():
    """Get the race calendar for a given year."""
    year = request.args.get("year", 2024, type=int)
    schedule = _read_json(DATA_DIR / "schedule.json")

    if schedule is None:
        return jsonify({"error": "Schedule data not found. Run preprocess.py first."}), 500

    year_str = str(year)
    races = schedule.get(year_str, [])

    return jsonify({"year": year, "races": races})


@app.route("/api/load-session", methods=["POST"])
def api_load_session():
    """Session loading is instant with pre-computed data."""
    year = request.json.get("year", 2024)
    gp = request.json.get("gp", "Bahrain")

    gp_dir = _find_gp_dir(year, gp)
    if gp_dir and (gp_dir / "session.json").exists():
        return jsonify({"status": "ready"})

    return jsonify({"status": "error", "error": f"No pre-computed data for {year} {gp}. Run: python preprocess.py --year {year}"}), 404


@app.route("/api/session-status", methods=["GET"])
def api_session_status():
    """Check if pre-computed data exists for a session."""
    year, gp = _parse_session_params()
    gp_dir = _find_gp_dir(year, gp)

    if gp_dir and (gp_dir / "session.json").exists():
        return jsonify({"status": "ready"})

    return jsonify({"status": "error", "error": f"No data for {year} {gp}"})


@app.route("/api/drivers", methods=["GET"])
def api_drivers():
    """List available drivers with lap counts."""
    year, gp = _parse_session_params()
    gp_dir = _find_gp_dir(year, gp)

    if gp_dir is None:
        return jsonify({"error": f"No data for {year} {gp}"}), 404

    session_data = _read_json(gp_dir / "session.json")
    if session_data is None:
        return jsonify({"error": "Session data not found"}), 404

    return jsonify({"drivers": session_data["drivers"]})


@app.route("/api/compare", methods=["GET"])
def api_compare():
    """Compare two drivers sector-by-sector (pure computation on pre-computed laps)."""
    year, gp = _parse_session_params()
    d1 = request.args.get("d1", "").upper()
    d2 = request.args.get("d2", "").upper()
    lap1 = request.args.get("lap1", type=int)
    lap2 = request.args.get("lap2", type=int)

    if not d1 or not d2:
        return jsonify({"error": "Provide both d1 and d2 query parameters"}), 400

    gp_dir = _find_gp_dir(year, gp)
    if gp_dir is None:
        return jsonify({"error": f"No data for {year} {gp}"}), 404

    laps_data = _read_json(gp_dir / "laps.json")
    session_data = _read_json(gp_dir / "session.json")
    if laps_data is None or session_data is None:
        return jsonify({"error": "Data not found"}), 404

    # Find laps for each driver
    d1_laps = [l for l in laps_data if l["driver"] == d1]
    d2_laps = [l for l in laps_data if l["driver"] == d2]

    if not d1_laps:
        return jsonify({"error": f"Driver {d1} not found"}), 400
    if not d2_laps:
        return jsonify({"error": f"Driver {d2} not found"}), 400

    # Pick specific or best lap
    if lap1 is not None:
        row1 = next((l for l in d1_laps if l["lapNumber"] == lap1), None)
        if row1 is None:
            return jsonify({"error": f"Lap {lap1} not found for {d1}"}), 400
    else:
        row1 = min(d1_laps, key=lambda l: l["lapTime"] or 999)

    if lap2 is not None:
        row2 = next((l for l in d2_laps if l["lapNumber"] == lap2), None)
        if row2 is None:
            return jsonify({"error": f"Lap {lap2} not found for {d2}"}), 400
    else:
        row2 = min(d2_laps, key=lambda l: l["lapTime"] or 999)

    # Build sector comparison
    sector_keys = [("sector1", "Sector 1"), ("sector2", "Sector 2"), ("sector3", "Sector 3")]
    sectors = []
    for key, name in sector_keys:
        t1 = row1.get(key)
        t2 = row2.get(key)
        if t1 is not None and t2 is not None:
            delta = round(t1 - t2, 3)
            faster = d1 if delta < 0 else (d2 if delta > 0 else "TIE")
        else:
            delta = None
            faster = "N/A"
        sectors.append({
            "sector": name,
            "time1": t1,
            "time2": t2,
            "delta": delta,
            "faster": faster,
        })

    # Build speed trap comparison
    speed_keys = [
        ("speedI1", "Intermediate 1"),
        ("speedI2", "Intermediate 2"),
        ("speedFL", "Finish Line"),
        ("speedST", "Speed Trap"),
    ]
    speed_traps = []
    for key, name in speed_keys:
        s1 = row1.get(key)
        s2 = row2.get(key)
        if s1 is not None and s2 is not None:
            delta = round(s1 - s2, 1)
            faster = d1 if delta > 0 else (d2 if delta < 0 else "TIE")
        else:
            delta = None
            faster = "N/A"
        speed_traps.append({
            "trap": name,
            "speed1": s1,
            "speed2": s2,
            "delta": delta,
            "faster": faster,
        })

    ot1 = row1["lapTime"]
    ot2 = row2["lapTime"]
    if ot1 is not None and ot2 is not None:
        overall_delta = round(ot1 - ot2, 3)
        overall_faster = d1 if ot1 < ot2 else (d2 if ot2 < ot1 else "TIE")
    else:
        overall_delta = None
        overall_faster = "N/A"

    c1, c2 = _get_color_pair(session_data["drivers"], d1, d2)

    return jsonify({
        "driver1": d1,
        "driver2": d2,
        "team1": row1["team"],
        "team2": row2["team"],
        "lap1_num": row1["lapNumber"],
        "lap2_num": row2["lapNumber"],
        "sectors": sectors,
        "speed_traps": speed_traps,
        "overall_time1": ot1,
        "overall_time2": ot2,
        "overall_delta": overall_delta,
        "overall_faster": overall_faster,
        "color1": c1,
        "color2": c2,
    })


@app.route("/api/track-dominance", methods=["GET"])
def api_track_dominance():
    """Get track dominance data for two drivers (computed from pre-computed telemetry)."""
    year, gp = _parse_session_params()
    d1 = request.args.get("d1", "").upper()
    d2 = request.args.get("d2", "").upper()
    lap1 = request.args.get("lap1", type=int)
    lap2 = request.args.get("lap2", type=int)

    if not d1 or not d2:
        return jsonify({"error": "Provide both d1 and d2 query parameters"}), 400

    gp_dir = _find_gp_dir(year, gp)
    if gp_dir is None:
        return jsonify({"error": f"No data for {year} {gp}"}), 404

    session_data = _read_json(gp_dir / "session.json")
    if session_data is None:
        return jsonify({"error": "Session data not found"}), 404

    # Find the telemetry files
    tel_dir = gp_dir / "telemetry"

    def _find_telemetry(driver, lap_num):
        if lap_num is not None:
            f = tel_dir / f"{driver}_{lap_num}.json"
            if f.exists():
                return _read_json(f)
            return None
        # Default: best lap — find the driver's best lap number
        for d in session_data["drivers"]:
            if d["driver"] == driver:
                best_num = d.get("bestLapNum")
                if best_num:
                    f = tel_dir / f"{driver}_{best_num}.json"
                    if f.exists():
                        return _read_json(f)
                break
        # Fallback: try any file for this driver
        for f in tel_dir.glob(f"{driver}_*.json"):
            return _read_json(f)
        return None

    tel1 = _find_telemetry(d1, lap1)
    tel2 = _find_telemetry(d2, lap2)

    if tel1 is None:
        return jsonify({"error": f"No telemetry data for {d1}"}), 404
    if tel2 is None:
        return jsonify({"error": f"No telemetry data for {d2}"}), 404

    # Compute dominance from pre-computed speed arrays
    s1 = tel1["speed"]
    s2 = tel2["speed"]

    # Use the shorter array length (should both be 200 but just in case)
    n = min(len(s1), len(s2), len(tel1["x"]), len(tel2["x"]))

    # Average X/Y for track center-line
    x = [(tel1["x"][i] + tel2["x"][i]) / 2 for i in range(n)]
    y = [(tel1["y"][i] + tel2["y"][i]) / 2 for i in range(n)]

    # +1 = d1 faster (higher speed), -1 = d2 faster
    dominance = []
    for i in range(n):
        if s1[i] > s2[i]:
            dominance.append(1)
        elif s2[i] > s1[i]:
            dominance.append(-1)
        else:
            dominance.append(0)

    d1_count = dominance.count(1)
    d2_count = dominance.count(-1)
    total = len(dominance)
    d1_pct = int(d1_count / total * 100) if total > 0 else 0
    d2_pct = int(d2_count / total * 100) if total > 0 else 0

    c1, c2 = _get_color_pair(session_data["drivers"], d1, d2)

    # Load corners
    corners = _read_json(gp_dir / "corners.json") or []

    # Get team info
    team1 = next((d["team"] for d in session_data["drivers"] if d["driver"] == d1), "")
    team2 = next((d["team"] for d in session_data["drivers"] if d["driver"] == d2), "")

    def _pad(arr, length):
        """Trim or zero-pad an array to exactly `length` elements."""
        if not arr:
            return [0] * length
        if len(arr) >= length:
            return arr[:length]
        return arr + [0] * (length - len(arr))

    extra_fields = ["gear", "drs", "rpm", "throttle", "brake"]
    extra1 = {f: _pad(tel1.get(f, []), n) for f in extra_fields}
    extra2 = {f: _pad(tel2.get(f, []), n) for f in extra_fields}

    return jsonify({
        "x": [round(v, 1) for v in x],
        "y": [round(v, 1) for v in y],
        "dominance": dominance,
        "speed1": s1[:n],
        "speed2": s2[:n],
        "gear1":     extra1["gear"],
        "gear2":     extra2["gear"],
        "drs1":      extra1["drs"],
        "drs2":      extra2["drs"],
        "rpm1":      extra1["rpm"],
        "rpm2":      extra2["rpm"],
        "throttle1": extra1["throttle"],
        "throttle2": extra2["throttle"],
        "brake1":    extra1["brake"],
        "brake2":    extra2["brake"],
        "driver1": d1,
        "driver2": d2,
        "team1": team1,
        "team2": team2,
        "lap1_num": tel1["lapNumber"],
        "lap2_num": tel2["lapNumber"],
        "color1": c1,
        "color2": c2,
        "d1_pct": d1_pct,
        "d2_pct": d2_pct,
        "corners": corners,
    })


@app.route("/api/strategy", methods=["GET"])
def api_strategy():
    """Get MLX-predicted tire degradation curves for a race."""
    year, gp = _parse_session_params()
    gp_dir = _find_gp_dir(year, gp)

    if gp_dir is None:
        return jsonify({"error": f"No data for {year} {gp}"}), 404

    strategy = _read_json(gp_dir / "strategy.json")
    if strategy is None:
        return jsonify({"error": f"No strategy data for {year} {gp}. Run: python preprocess.py --year {year} --gp {gp}"}), 404

    return jsonify(strategy)


# ── Catch-all: serve React index.html for client-side routes ────────
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if app.static_folder is None:
        return "Frontend not built", 404
    full = os.path.join(app.static_folder, path)
    if path and os.path.isfile(full):
        return send_from_directory(app.static_folder, path)
    index = os.path.join(app.static_folder, "index.html")
    if os.path.isfile(index):
        return send_from_directory(app.static_folder, "index.html")
    return "Frontend not built. Run: cd frontend && npm run build", 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    print("\n🏁  F1 Sector Analysis API (Pre-computed Data)")
    print(f"   Data directory: {DATA_DIR}")
    print(f"   API running at http://localhost:{port}\n")
    app.run(debug=debug, port=port)
