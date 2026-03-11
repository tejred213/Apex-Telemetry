#!/usr/bin/env python3
"""
F1 Sector Analysis — Pre-Processing Script

Downloads and pre-computes all F1 qualifying data into static JSON files.
Run this locally once; the web app then serves instant responses.

Usage:
    python preprocess.py                          # All seasons (2018-2025)
    python preprocess.py --year 2024              # Single season
    python preprocess.py --year 2024 --gp Bahrain # Single session
"""

import argparse
import json
import sys
import traceback
from pathlib import Path

import fastf1
import numpy as np
import pandas as pd

from strategy_engine import build_strategy, COMPOUND_INDEX

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CACHE_DIR = Path(__file__).resolve().parent / "cache"
DATA_DIR = Path(__file__).resolve().parent / "data"
CACHE_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

fastf1.Cache.enable_cache(str(CACHE_DIR))

# FastF1 has good qualifying telemetry from 2018 onward
ALL_YEARS = list(range(2018, 2026))

# Team colour fallbacks (FastF1 sometimes returns white)
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

NUM_MINI_SECTORS = 200  # resample telemetry to this many points


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_float(v):
    """Convert value to float, return None for NaN/NaT."""
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    try:
        return round(float(v), 3)
    except (TypeError, ValueError):
        return None


def safe_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def sanitize_gp_name(name: str) -> str:
    """Normalize GP name for filesystem: spaces → underscores, safe chars only."""
    return name.replace(" ", "_").replace("'", "").replace(".", "")


# ---------------------------------------------------------------------------
# Processing functions
# ---------------------------------------------------------------------------

def process_schedule(years: list[int]):
    """Generate data/schedule.json with all races for all years."""
    print("\n📅 Processing schedules...")
    
    # Load existing schedule if it exists, to support incremental updates
    out = DATA_DIR / "schedule.json"
    if out.exists():
        try:
            schedule = json.loads(out.read_text())
        except Exception:
            schedule = {}
    else:
        schedule = {}

    for year in years:
        try:
            sched = fastf1.get_event_schedule(year)
            races = []
            for _, row in sched.iterrows():
                rn = int(row["RoundNumber"])
                if rn == 0:
                    continue
                races.append({
                    "round": rn,
                    "name": row["EventName"],
                    "country": row["Country"],
                    "location": row.get("Location", ""),
                })
            schedule[str(year)] = races
            print(f"  ✅ {year}: {len(races)} races")
        except Exception as e:
            print(f"  ❌ {year}: {e}")

    out = DATA_DIR / "schedule.json"
    out.write_text(json.dumps(schedule, indent=2))
    print(f"  → Saved {out}")
    return schedule


def process_session(year: int, gp_name: str, gp_dir_name: str, force_telemetry: bool = False):
    """Process a single qualifying session into JSON files."""

    gp_dir = DATA_DIR / str(year) / gp_dir_name
    gp_dir.mkdir(parents=True, exist_ok=True)

    # If force_telemetry, wipe existing telemetry and rebuild (keep laps/session)
    if force_telemetry:
        tel_dir_existing = gp_dir / "telemetry"
        if tel_dir_existing.exists():
            import shutil
            shutil.rmtree(tel_dir_existing)
            print(f"    🗑️  Cleared existing telemetry cache")

    # Skip if already processed (unless force_telemetry, which only rebuilds telemetry)
    if (gp_dir / "session.json").exists() and (gp_dir / "laps.json").exists() and not force_telemetry:
        print(f"    ⏭  Already processed, skipping")
        return True

    # ── Load session ───────────────────────────────────────────────────
    try:
        session = fastf1.get_session(year, gp_name, "Q")
        session.load(telemetry=True)
    except Exception as e:
        print(f"    ❌ Failed to load: {e}")
        return False

    laps = session.laps.copy()

    # ── Filter to accurate laps ───────────────────────────────────────
    accurate = laps[laps["IsAccurate"] == True].reset_index(drop=True)

    if accurate.empty:
        print(f"    ⚠️  No accurate laps, skipping")
        return False

    # ── Convert sector times to seconds ───────────────────────────────
    for col in ("Sector1Time", "Sector2Time", "Sector3Time", "LapTime"):
        accurate[f"{col}_sec"] = accurate[col].dt.total_seconds()

    # ── Driver info + colors ──────────────────────────────────────────
    drivers = []
    color_map = {}

    for drv in accurate["Driver"].unique():
        drv_laps = accurate[accurate["Driver"] == drv]
        team = drv_laps.iloc[0]["Team"]

        # Get team color
        try:
            color = fastf1.plotting.get_team_color(team, session=session)
        except Exception:
            color = "#FFFFFF"
        if color in ("#FFFFFF", "#FFF", "#ffffff"):
            color = TEAM_COLORS_FALLBACK.get(team, "#FFFFFF")
        color_map[drv] = color

        # Available laps for this driver
        lap_numbers = sorted(drv_laps["LapNumber"].astype(int).tolist())
        best_lap_time = drv_laps["LapTime_sec"].min()
        best_lap_num = int(drv_laps.loc[drv_laps["LapTime_sec"].idxmin(), "LapNumber"])

        drivers.append({
            "driver": drv,
            "team": team,
            "color": color,
            "totalLaps": len(drv_laps),
            "bestLap": safe_float(best_lap_time),
            "bestLapNum": best_lap_num,
            "lapNumbers": lap_numbers,
        })

    # Sort by best lap time
    drivers.sort(key=lambda d: d["bestLap"] or 999)

    # ── Save session.json ─────────────────────────────────────────────
    session_data = {
        "year": year,
        "gp": gp_name,
        "drivers": drivers,
    }
    (gp_dir / "session.json").write_text(json.dumps(session_data, indent=2))

    # ── Save laps.json (all accurate laps) ────────────────────────────
    laps_list = []
    for _, row in accurate.iterrows():
        laps_list.append({
            "driver": row["Driver"],
            "team": row["Team"],
            "lapNumber": safe_int(row["LapNumber"]),
            "lapTime": safe_float(row["LapTime_sec"]),
            "sector1": safe_float(row["Sector1Time_sec"]),
            "sector2": safe_float(row["Sector2Time_sec"]),
            "sector3": safe_float(row["Sector3Time_sec"]),
            "speedI1": safe_float(row.get("SpeedI1")),
            "speedI2": safe_float(row.get("SpeedI2")),
            "speedFL": safe_float(row.get("SpeedFL")),
            "speedST": safe_float(row.get("SpeedST")),
        })
    (gp_dir / "laps.json").write_text(json.dumps(laps_list, indent=2))

    # ── Save corners.json ─────────────────────────────────────────────
    corners = []
    try:
        ci = session.get_circuit_info()
        for _, row in ci.corners.iterrows():
            corners.append({
                "x": float(row["X"]),
                "y": float(row["Y"]),
                "number": int(row["Number"]),
                "letter": str(row.get("Letter", "")),
                "angle": float(row["Angle"]),
            })
    except Exception:
        pass  # older sessions may lack circuit info
    (gp_dir / "corners.json").write_text(json.dumps(corners, indent=2))

    # ── Save telemetry for each driver's best lap ─────────────────────
    # IMPORTANT: Use session.laps (not the copy) to preserve telemetry access
    tel_dir = gp_dir / "telemetry"
    tel_dir.mkdir(exist_ok=True)

    for drv_info in drivers:
        drv = drv_info["driver"]
        best_num = drv_info["bestLapNum"]
        filename = f"{drv}_{best_num}.json"

        if (tel_dir / filename).exists():
            continue

        try:
            drv_laps_raw = session.laps.pick_drivers(drv)
            lap_row = drv_laps_raw[drv_laps_raw["LapNumber"] == best_num].iloc[0]
            tel = lap_row.get_telemetry().add_distance()

            if tel.empty or tel["Distance"].max() < 100:
                continue

            # Resample to uniform distance grid
            total_dist = tel["Distance"].max()
            ref_dist = np.linspace(0, total_dist, NUM_MINI_SECTORS)

            def _interp(col, round_digits=1):
                """Interpolate telemetry column onto ref_dist grid."""
                if col not in tel.columns:
                    return [0.0] * NUM_MINI_SECTORS
                return [round(float(v), round_digits)
                        for v in np.interp(ref_dist, tel["Distance"], tel[col])]

            tel_data = {
                "driver": drv,
                "lapNumber": best_num,
                "distance": [round(float(d), 1) for d in ref_dist],
                "x": _interp("X"),
                "y": _interp("Y"),
                "speed":    _interp("Speed"),
                "gear":     _interp("nGear", round_digits=0),
                "drs":      _interp("DRS",   round_digits=0),
                "rpm":      _interp("RPM",   round_digits=0),
                "throttle": _interp("Throttle"),
                "brake":    _interp("Brake"),
            }
            (tel_dir / filename).write_text(json.dumps(tel_data))
        except Exception as e:
            print(f"      ⚠️  Telemetry failed for {drv} lap {best_num}: {e}")

    n_tel = len(list(tel_dir.glob("*.json")))
    print(f"    ✅ {len(drivers)} drivers, {len(laps_list)} laps, {n_tel} telemetry files, {len(corners)} corners")
    return True


def process_race_session(year: int, gp_name: str, gp_dir_name: str):
    """
    Process a Race session to extract tire stint data, train an MLX
    degradation model, AND build simulation data (track map + driver
    lap histories).  Saves data/<year>/<gp>/strategy.json.
    """
    gp_dir = DATA_DIR / str(year) / gp_dir_name
    gp_dir.mkdir(parents=True, exist_ok=True)

    strategy_file = gp_dir / "strategy.json"
    if strategy_file.exists():
        try:
            old_data = json.loads(strategy_file.read_text())
            if "simulation" in old_data:
                print(f"    ⏭  Race strategy/simulation already processed, skipping")
                return True
        except Exception:
            pass

    # Load Race session — WITH telemetry so we can extract track map
    try:
        session = fastf1.get_session(year, gp_name, "R")
        session.load(telemetry=True, weather=False, messages=False)
    except Exception as e:
        print(f"    ❌ Failed to load Race session: {e}")
        return False

    laps = session.laps.copy()
    total_race_laps = session.total_laps if hasattr(session, "total_laps") else int(laps["LapNumber"].max())

    # ── Extract track map from fastest lap telemetry ──────────────────
    track_map = []
    try:
        fastest = session.laps.pick_fastest()
        if fastest is not None:
            tel = fastest.get_telemetry()
            if "X" in tel.columns and "Y" in tel.columns:
                xs = tel["X"].values
                ys = tel["Y"].values
                # Downsample to ~200 points for a smooth but lightweight path
                step = max(1, len(xs) // 200)
                track_map = [[round(float(xs[i]), 1), round(float(ys[i]), 1)]
                             for i in range(0, len(xs), step)]
                print(f"    🗺️  Track map: {len(track_map)} points")
    except Exception as e:
        print(f"    ⚠️  Could not extract track map: {e}")

    # ── Build per-driver actual lap histories + team colors ───────────
    sim_drivers = {}
    all_drivers = laps["Driver"].unique()

    for drv in all_drivers:
        drv_laps = laps[laps["Driver"] == drv].sort_values("LapNumber")
        team = drv_laps.iloc[0]["Team"] if "Team" in drv_laps.columns else ""

        # Get driver number
        try:
            drv_info = session.get_driver(drv)
            drv_number = str(drv_info.get("DriverNumber", ""))
        except Exception:
            drv_number = ""

        # Resolve team color
        try:
            color = fastf1.plotting.get_team_color(team, session=session)
        except Exception:
            color = "#FFFFFF"
        if color in ("#FFFFFF", "#FFF", "#ffffff"):
            color = TEAM_COLORS_FALLBACK.get(team, "#FFFFFF")

        # Build lap-by-lap history
        actual_laps = []
        for _, row in drv_laps.iterrows():
            lt = row.get("LapTime")
            lt_sec = lt.total_seconds() if pd.notna(lt) else None
            if lt_sec is None or lt_sec <= 0 or lt_sec > 300:
                continue
            compound = str(row.get("Compound", "")).upper()
            actual_laps.append({
                "lap": safe_int(row["LapNumber"]),
                "time": round(lt_sec, 3),
                "compound": compound if compound in COMPOUND_INDEX else "UNKNOWN",
            })

        if actual_laps:
            sim_drivers[drv] = {
                "color": color,
                "team": team,
                "number": drv_number,
                "actualLaps": actual_laps,
            }

    print(f"    👥 Simulation drivers: {len(sim_drivers)}")

    # ── Filter to accurate laps for MLX training ─────────────────────
    accurate = laps[laps["IsAccurate"] == True].copy()

    if accurate.empty:
        print(f"    ⚠️  No accurate race laps, skipping strategy")
        return False

    # Convert times
    accurate["LapTime_sec"] = accurate["LapTime"].dt.total_seconds()

    # Build race lap list for the strategy engine
    race_laps: list[dict] = []
    for _, row in accurate.iterrows():
        compound = str(row.get("Compound", "")).upper()
        if compound not in COMPOUND_INDEX:
            continue

        lt = safe_float(row["LapTime_sec"])
        if lt is None or lt <= 0:
            continue

        tire_life = safe_int(row.get("TyreLife", 0)) or 0

        race_laps.append({
            "driver": row["Driver"],
            "lapNumber": safe_int(row["LapNumber"]),
            "lapTime": lt,
            "compound": compound,
            "tireLife": tire_life,
            "stint": safe_int(row.get("Stint", 1)) or 1,
        })

    if len(race_laps) < 20:
        print(f"    ⚠️  Only {len(race_laps)} valid race laps — too few for model")
        return False

    print(f"    🏁 Race data: {len(race_laps)} laps, {total_race_laps} total race laps")

    # Call the MLX strategy engine
    ok = build_strategy(
        race_laps=race_laps,
        total_laps=total_race_laps,
        output_path=strategy_file,
        verbose=True,
    )

    # ── Append simulation block to the saved strategy.json ────────────
    if ok and strategy_file.exists():
        try:
            data = json.loads(strategy_file.read_text())
            data["simulation"] = {
                "trackMap": track_map,
                "drivers": sim_drivers,
            }
            strategy_file.write_text(json.dumps(data, indent=2))
            print(f"    🏎️  Simulation data appended to strategy.json")
        except Exception as e:
            print(f"    ⚠️  Failed to append simulation data: {e}")

    return ok


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Pre-process F1 qualifying data")
    parser.add_argument("--year", type=int, help="Process a single year")
    parser.add_argument("--gp", type=str, help="Process a single GP (requires --year)")
    parser.add_argument("--force-telemetry", action="store_true",
                        help="Wipe and rebuild telemetry/ files (keeps laps/session data)")
    parser.add_argument("--skip-strategy", action="store_true",
                        help="Skip MLX race strategy model training")
    parser.add_argument("--race-only", action="store_true",
                        help="Skip qualifying processing and only process race/strategy simulation")
    args = parser.parse_args()

    if args.gp and not args.year:
        parser.error("--gp requires --year")

    years = [args.year] if args.year else ALL_YEARS

    # ── Step 1: Schedules ─────────────────────────────────────────────
    schedule = process_schedule(years)

    # ── Step 2: Qualifying Sessions ───────────────────────────────────
    total, success, failed = 0, 0, 0

    if not args.race_only:
        for year in years:
            year_str = str(year)
            if year_str not in schedule:
                continue
    
            races = schedule[year_str]
            print(f"\n🏎️  Processing {year} ({len(races)} races)...")
    
            for race in races:
                gp_name = race["name"]
                gp_dir_name = sanitize_gp_name(gp_name)
    
                # If --gp flag, only process that specific GP
                if args.gp and args.gp.lower() not in gp_name.lower():
                    continue
    
                total += 1
                print(f"\n  📍 R{race['round']}: {gp_name}")
    
                try:
                    ok = process_session(year, gp_name, gp_dir_name,
                                         force_telemetry=args.force_telemetry)
                    if ok:
                        success += 1
                    else:
                        failed += 1
                except Exception as e:
                    failed += 1
                    print(f"    ❌ Unexpected error: {e}")
                    traceback.print_exc()

    # ── Step 3: Race Strategy (MLX) ───────────────────────────────────
    strategy_total, strategy_ok = 0, 0
    if not args.skip_strategy:
        print(f"\n{'='*60}")
        print("🧠 Processing Race Strategy (MLX tire degradation)…")
        print(f"{'='*60}")

        for year in years:
            year_str = str(year)
            if year_str not in schedule:
                continue

            races = schedule[year_str]
            for race in races:
                gp_name = race["name"]
                gp_dir_name = sanitize_gp_name(gp_name)

                if args.gp and args.gp.lower() not in gp_name.lower():
                    continue

                strategy_total += 1
                print(f"\n  📍 R{race['round']}: {gp_name} (Race)")

                try:
                    ok = process_race_session(year, gp_name, gp_dir_name)
                    if ok:
                        strategy_ok += 1
                except Exception as e:
                    print(f"    ❌ Strategy error: {e}")
                    traceback.print_exc()

    print(f"\n{'='*60}")
    print(f"✅ Done! Qualifying: {success}/{total} | Strategy: {strategy_ok}/{strategy_total}")
    print(f"   Data saved to: {DATA_DIR}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
