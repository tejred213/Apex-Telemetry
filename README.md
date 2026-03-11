# 🏎️ ApexTelemetry

A web application that provides sector-by-sector comparison of Formula 1 qualifying laps. Built with **React** and **Flask**, powered by the **FastF1** Python library for official F1 telemetry data.

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Flask](https://img.shields.io/badge/Flask-3.x-000000?logo=flask)

## What It Does

Pick any F1 qualifying session, select two drivers, and get a full breakdown:

- **Sector Times** — Side-by-side comparison for each of the three sectors
- **Speed Traps** — Intermediate speeds and top speed comparison
- **Track Dominance Map** — Interactive map showing which driver was faster at every point on the circuit, with official turn numbers, zoom, and pan
- **Verdict Banner** — Overall delta and sector win count at a glance

## Project Structure

```
F1-Sector Analysis/
├── app.py                  # Flask API backend
├── sector_analysis.py      # Core data processing (FastF1)
├── graph_generator.py      # Matplotlib chart generation (CLI)
├── main.py                 # CLI entry point
└── frontend/
    └── src/
        ├── App.jsx                # Main app with session & driver state
        ├── index.css              # Full design system (F1 broadcast style)
        └── components/
            ├── SessionSelector.jsx    # Year & GP picker
            ├── DriverSelector.jsx     # Driver & lap picker
            ├── VerdictBanner.jsx      # Overall result summary
            ├── SectorCards.jsx        # Sector time cards
            ├── SpeedTraps.jsx         # Speed comparison bars
            ├── TrackDominance.jsx     # Interactive track map (canvas)
            └── Navbar.jsx             # Top navigation bar
```

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+

### Backend

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install flask flask-cors fastf1 numpy

# Start the API server
python app.py
```

The API runs at `http://localhost:5000`.

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

The app opens at `http://localhost:5173`. The Vite dev server proxies `/api` requests to the Flask backend automatically.

## How to Use

1. **Select a season** (year) and **Grand Prix** from the dropdowns
2. Click **Load Session** — telemetry data loads in the background (~15–30s for first load, cached after that)
3. **Pick two drivers** to compare
4. Click **Compare Drivers**
5. Scroll through the results: verdict, sector times, track dominance map, and speed traps

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/schedule?year=` | GET | List of races for a season |
| `/api/load-session` | POST | Trigger background session load |
| `/api/session-status?year=&gp=` | GET | Poll session load progress |
| `/api/drivers?year=&gp=` | GET | List drivers in a session |
| `/api/compare?d1=&d2=&year=&gp=` | GET | Sector-by-sector comparison |
| `/api/track-dominance?d1=&d2=&year=&gp=` | GET | Track dominance + corner data |

## Tech Stack

| Layer | Technology |
|---|---|
| Data | [FastF1](https://docs.fastf1.dev/) — Official F1 telemetry |
| Backend | Flask, NumPy |
| Frontend | React 19, Vite |
| Styling | Vanilla CSS (F1 broadcast dark theme) |
| Charts | HTML Canvas (track map), CSS animations |
