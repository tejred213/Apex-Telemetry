import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────
const COMPOUND_META = {
    SOFT:   { label: 'Soft',   color: '#E10600', icon: '🔴' },
    MEDIUM: { label: 'Medium', color: '#FFC700', icon: '🟡' },
    HARD:   { label: 'Hard',   color: '#CCCCCC', icon: '⚪' },
};

const SVG_W = 700;
const SVG_H = 500;
const DOT_R = 6;
const DOT_R_HERO = 8;
const TRACK_STROKE = 2.2;
const SPEED_MULTIPLIER = [1, 2, 5, 10, 20];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalise raw track XY points to fit within the SVG viewbox, keeping aspect
 * ratio.  Returns array of {x, y}.
 */
function normaliseTrack(trackMap, padding = 40) {
    if (!trackMap || trackMap.length < 2) return [];
    const xs = trackMap.map(p => p[0]);
    const ys = trackMap.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min((SVG_W - padding * 2) / rangeX, (SVG_H - padding * 2) / rangeY);
    const offX = (SVG_W - rangeX * scale) / 2;
    const offY = (SVG_H - rangeY * scale) / 2;
    return trackMap.map(([x, y]) => ({
        x: (x - minX) * scale + offX,
        y: (y - minY) * scale + offY,
    }));
}

/**
 * Build a cumulative-time timeline from an array of lap objects.
 * Returns { cumulativeTimes: [0, t1, t1+t2, ...], totalTime }
 */
function buildTimeline(laps) {
    let cum = 0;
    const times = [0]; // start at 0
    for (const lap of laps) {
        cum += lap.time;
        times.push(cum);
    }
    return { cumulativeTimes: times, totalTime: cum };
}

/**
 * Given a current elapsed time and a cumulative-time array, return 0..1
 * fraction around the current lap.
 */
function getTrackFraction(elapsed, cumulativeTimes) {
    if (elapsed <= 0) return 0;
    const total = cumulativeTimes[cumulativeTimes.length - 1];
    if (elapsed >= total) return 1;

    // Find which lap we're on
    let lapIdx = 0;
    for (let i = 1; i < cumulativeTimes.length; i++) {
        if (elapsed < cumulativeTimes[i]) {
            lapIdx = i - 1;
            break;
        }
    }
    const lapStart = cumulativeTimes[lapIdx];
    const lapEnd = cumulativeTimes[lapIdx + 1] || lapStart + 90;
    const lapDuration = lapEnd - lapStart;
    const lapFraction = lapDuration > 0 ? (elapsed - lapStart) / lapDuration : 0;
    return lapFraction;
}

function getLapNumber(elapsed, cumulativeTimes) {
    if (elapsed <= 0) return 1;
    for (let i = 1; i < cumulativeTimes.length; i++) {
        if (elapsed < cumulativeTimes[i]) return i;
    }
    return cumulativeTimes.length - 1;
}

/**
 * Interpolate a point along the track for a given 0-1 fraction.
 */
function getTrackPosition(fraction, normTrack) {
    if (!normTrack.length) return { x: 0, y: 0 };
    const frac = ((fraction % 1) + 1) % 1; // wrap around
    const idx = frac * (normTrack.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, normTrack.length - 1);
    const t = idx - lo;
    return {
        x: normTrack[lo].x + (normTrack[hi].x - normTrack[lo].x) * t,
        y: normTrack[lo].y + (normTrack[hi].y - normTrack[lo].y) * t,
    };
}

function formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function RaceSimulation({ simulation, compounds, stints, totalLaps }) {
    if (!simulation || !simulation.trackMap || simulation.trackMap.length < 10) return null;

    const { trackMap, drivers } = simulation;
    const driverCodes = Object.keys(drivers);

    // State
    const [selectedDriver, setSelectedDriver] = useState(driverCodes[0] || '');
    const [playing, setPlaying] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [speedIdx, setSpeedIdx] = useState(2); // default 5x
    const animRef = useRef(null);
    const lastFrameRef = useRef(null);

    // Normalised track
    const normTrack = useMemo(() => normaliseTrack(trackMap), [trackMap]);
    const trackPath = useMemo(() => {
        if (!normTrack.length) return '';
        return normTrack.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
    }, [normTrack]);

    // Build timelines for all drivers
    const timelines = useMemo(() => {
        const tl = {};
        for (const [code, drv] of Object.entries(drivers)) {
            tl[code] = buildTimeline(drv.actualLaps);
        }
        return tl;
    }, [drivers]);

    // Build custom timeline for the selected driver using MLX predictions
    const customTimeline = useMemo(() => {
        if (!selectedDriver || !stints || stints.length === 0) return null;
        // Generate predicted laps from the stints using the compound curves
        const laps = [];
        for (const stint of stints) {
            const comp = compounds[stint.compound];
            if (!comp) continue;
            for (let t = 0; t < stint.laps; t++) {
                const idx = Math.min(t, comp.curve.length - 1);
                laps.push({ time: comp.curve[idx].predicted, compound: stint.compound });
            }
        }
        if (laps.length === 0) return null;
        return buildTimeline(laps);
    }, [selectedDriver, stints, compounds]);

    // Max race time across all drivers (for the slider)
    const maxTime = useMemo(() => {
        let max = 0;
        for (const tl of Object.values(timelines)) {
            if (tl.totalTime > max) max = tl.totalTime;
        }
        if (customTimeline && customTimeline.totalTime > max) max = customTimeline.totalTime;
        return max;
    }, [timelines, customTimeline]);

    // Animation loop
    useEffect(() => {
        if (!playing) {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            lastFrameRef.current = null;
            return;
        }

        function tick(timestamp) {
            if (!lastFrameRef.current) lastFrameRef.current = timestamp;
            const dt = (timestamp - lastFrameRef.current) / 1000; // real seconds
            lastFrameRef.current = timestamp;

            setElapsed(prev => {
                const next = prev + dt * SPEED_MULTIPLIER[speedIdx];
                if (next >= maxTime) {
                    setPlaying(false);
                    return maxTime;
                }
                return next;
            });

            animRef.current = requestAnimationFrame(tick);
        }

        animRef.current = requestAnimationFrame(tick);
        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, [playing, speedIdx, maxTime]);

    // Reset on driver change
    useEffect(() => {
        setElapsed(0);
        setPlaying(false);
    }, [selectedDriver]);

    const handlePlayPause = () => {
        if (elapsed >= maxTime) setElapsed(0);
        setPlaying(p => !p);
    };

    const handleSlider = (e) => {
        setElapsed(parseFloat(e.target.value));
        setPlaying(false);
    };

    const cycleSpeed = () => {
        setSpeedIdx(i => (i + 1) % SPEED_MULTIPLIER.length);
    };

    // ── Compute car positions ────────────────────────────────────────
    const carPositions = useMemo(() => {
        const positions = [];

        for (const code of driverCodes) {
            const drv = drivers[code];
            const isHero = code === selectedDriver;
            const tl = isHero && customTimeline ? customTimeline : timelines[code];
            if (!tl) continue;

            const fraction = getTrackFraction(elapsed, tl.cumulativeTimes);
            const pos = getTrackPosition(fraction, normTrack);
            const currentLap = getLapNumber(elapsed, tl.cumulativeTimes);
            const finished = elapsed >= tl.totalTime;

            positions.push({
                code,
                ...pos,
                color: drv.color,
                isHero,
                currentLap,
                finished,
            });
        }

        return positions;
    }, [driverCodes, drivers, selectedDriver, customTimeline, timelines, elapsed, normTrack]);

    // Current lap of hero driver
    const heroTl = customTimeline || timelines[selectedDriver];
    const heroLap = heroTl ? getLapNumber(elapsed, heroTl.cumulativeTimes) : 0;

    return (
        <div className="race-sim fade-in stagger-4">
            <div className="section-header fade-in">
                <div className="accent-line" />
                <h2>Race Simulation</h2>
            </div>

            <p className="race-sim__intro">
                Select a driver to apply your custom strategy. All other drivers use their actual race lap times.
            </p>

            {/* ── Controls ────────────────────────────────────────────── */}
            <div className="race-sim__controls">
                <div className="race-sim__control-group">
                    <label className="race-sim__label">DRIVER</label>
                    <select
                        className="race-sim__select"
                        value={selectedDriver}
                        onChange={e => setSelectedDriver(e.target.value)}
                    >
                        {driverCodes.map(code => (
                            <option key={code} value={code}>
                                #{drivers[code].number || '?'} {code} — {drivers[code].team}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="race-sim__control-group">
                    <button className="race-sim__play-btn" onClick={handlePlayPause}>
                        {playing ? '⏸' : '▶'}
                    </button>
                    <button className="race-sim__speed-btn" onClick={cycleSpeed}>
                        {SPEED_MULTIPLIER[speedIdx]}×
                    </button>
                </div>

                <div className="race-sim__control-group race-sim__control-group--info">
                    <span className="race-sim__stat">
                        <span className="race-sim__stat-label">LAP</span>
                        <span className="race-sim__stat-value">{heroLap} / {totalLaps}</span>
                    </span>
                    <span className="race-sim__stat">
                        <span className="race-sim__stat-label">TIME</span>
                        <span className="race-sim__stat-value">{formatTime(elapsed)}</span>
                    </span>
                </div>
            </div>

            {/* ── Scrubber ────────────────────────────────────────────── */}
            <div className="race-sim__scrubber">
                <input
                    type="range"
                    className="race-sim__slider"
                    min={0}
                    max={maxTime}
                    step={0.5}
                    value={elapsed}
                    onChange={handleSlider}
                />
                <div className="race-sim__scrubber-labels">
                    <span>0:00</span>
                    <span>{formatTime(maxTime)}</span>
                </div>
            </div>

            {/* ── Track Map SVG ────────────────────────────────────────── */}
            <div className="race-sim__track-container">
                <svg
                    viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                    className="race-sim__svg"
                    preserveAspectRatio="xMidYMid meet"
                >
                    {/* Track path */}
                    <path
                        d={trackPath}
                        fill="none"
                        stroke="rgba(255,255,255,0.25)"
                        strokeWidth={TRACK_STROKE}
                        strokeLinejoin="round"
                    />

                    {/* Car dots — non-hero first, hero on top */}
                    {carPositions
                        .filter(c => !c.isHero)
                        .map(car => (
                            <g key={car.code} opacity={car.finished ? 0.3 : 0.85}>
                                <circle
                                    cx={car.x}
                                    cy={car.y}
                                    r={DOT_R}
                                    fill={car.color}
                                />
                                <text
                                    x={car.x + DOT_R + 3}
                                    y={car.y + 3}
                                    fill="rgba(255,255,255,0.6)"
                                    fontSize="7"
                                    fontWeight="700"
                                    fontFamily="Inter, sans-serif"
                                    letterSpacing="0.5"
                                >
                                    {drivers[car.code]?.number || ''} {car.code}
                                </text>
                            </g>
                        ))
                    }
                    {carPositions
                        .filter(c => c.isHero)
                        .map(car => (
                            <g key={car.code}>
                                {/* Glow behind hero */}
                                <circle
                                    cx={car.x}
                                    cy={car.y}
                                    r={DOT_R_HERO + 5}
                                    fill={car.color}
                                    opacity={0.3}
                                    className="race-sim__hero-glow"
                                />
                                <circle
                                    cx={car.x}
                                    cy={car.y}
                                    r={DOT_R_HERO}
                                    fill={car.color}
                                    stroke="#fff"
                                    strokeWidth={1.5}
                                />
                                {/* Hero driver label with background */}
                                <rect
                                    x={car.x + DOT_R_HERO + 4}
                                    y={car.y - 6}
                                    width={38}
                                    height={13}
                                    rx={3}
                                    fill="rgba(0,0,0,0.7)"
                                    stroke={car.color}
                                    strokeWidth={0.8}
                                />
                                <text
                                    x={car.x + DOT_R_HERO + 7}
                                    y={car.y + 4}
                                    fill="#fff"
                                    fontSize="8"
                                    fontWeight="800"
                                    fontFamily="Inter, sans-serif"
                                    letterSpacing="0.8"
                                >
                                    {drivers[car.code]?.number || ''} {car.code}
                                </text>
                            </g>
                        ))
                    }
                </svg>

                {/* Legend */}
                <div className="race-sim__track-legend">
                    <span className="race-sim__legend-item">
                        <span
                            className="race-sim__legend-dot race-sim__legend-dot--hero"
                            style={{ background: drivers[selectedDriver]?.color }}
                        />
                        {selectedDriver} (Custom Strategy)
                    </span>
                    <span className="race-sim__legend-item race-sim__legend-item--muted">
                        <span className="race-sim__legend-dot" style={{ background: '#888' }}/>
                        Other Drivers (Actual Race)
                    </span>
                </div>
            </div>
        </div>
    );
}
