import { useMemo } from 'react';

// ─── Compound metadata ───────────────────────────────────────────────────────
const COMPOUND_META = {
    SOFT:   { label: 'Soft',   color: '#E10600', icon: '🔴' },
    MEDIUM: { label: 'Medium', color: '#FFC700', icon: '🟡' },
    HARD:   { label: 'Hard',   color: '#CCCCCC', icon: '⚪' },
};

const PIT_STOP_LOSS_SEC = 23; // average pit-stop time loss in seconds

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatRaceTime(totalSeconds) {
    if (!totalSeconds || !isFinite(totalSeconds)) return '—';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function getLapTime(compounds, compound, tireAge) {
    const comp = compounds[compound];
    if (!comp) return null;
    const curve = comp.curve;
    // Clamp to last available data point if tire age exceeds curve length
    const idx = Math.min(tireAge, curve.length - 1);
    return curve[idx]?.predicted ?? null;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function StrategyBuilder({ data, stints, setStints }) {
    const { totalLaps, compounds } = data;
    const availableCompounds = Object.keys(compounds);

    // ── Derived values ────────────────────────────────────────────────────
    const usedLaps = stints.reduce((sum, s) => sum + s.laps, 0);
    const remaining = totalLaps - usedLaps;
    const pitStops = Math.max(0, stints.length - 1);

    // Calculate total race time from predicted curves
    const { totalTime, stintTimes, lapByLap } = useMemo(() => {
        let total = 0;
        const times = [];
        const lbl = [];
        let raceLap = 0;

        for (const stint of stints) {
            let stintTotal = 0;
            for (let t = 0; t < stint.laps; t++) {
                const lt = getLapTime(compounds, stint.compound, t);
                if (lt !== null) {
                    stintTotal += lt;
                    lbl.push({ raceLap: raceLap + 1, tireAge: t, compound: stint.compound, time: lt });
                }
                raceLap++;
            }
            times.push(stintTotal);
            total += stintTotal;
        }

        // Add pit-stop losses
        total += pitStops * PIT_STOP_LOSS_SEC;

        return { totalTime: total, stintTimes: times, lapByLap: lbl };
    }, [stints, compounds, pitStops]);

    // ── Stint CRUD ────────────────────────────────────────────────────────
    function updateStint(idx, field, value) {
        setStints(prev =>
            prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
        );
    }

    function addStint() {
        const defaultCompound = availableCompounds[0] || 'SOFT';
        setStints(prev => [...prev, { compound: defaultCompound, laps: Math.max(remaining, 1) }]);
    }

    function removeStint(idx) {
        if (stints.length <= 1) return;
        setStints(prev => prev.filter((_, i) => i !== idx));
    }

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className="strategy-builder fade-in stagger-3">

            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="section-header fade-in">
                <div className="accent-line" />
                <h2>Strategy Builder</h2>
            </div>

            <p className="strategy-builder__intro">
                Build your own race strategy by selecting compounds and stint lengths.
                The predicted total race time is computed using the MLX degradation model.
            </p>

            {/* ── Timeline Bar ────────────────────────────────────────── */}
            <div className="stint-timeline">
                <div className="stint-timeline__bar">
                    {stints.map((stint, i) => {
                        const pct = totalLaps > 0 ? (stint.laps / totalLaps) * 100 : 0;
                        const meta = COMPOUND_META[stint.compound] || { color: '#555', label: stint.compound };
                        return (
                            <div
                                key={i}
                                className="stint-segment"
                                style={{
                                    width: `${Math.max(pct, 2)}%`,
                                    background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)`,
                                }}
                                title={`${meta.label}: ${stint.laps} laps`}
                            >
                                <span className="stint-segment__label">
                                    {stint.laps > 3 && `${stint.laps}L`}
                                </span>
                            </div>
                        );
                    })}
                    {remaining > 0 && (
                        <div
                            className="stint-segment stint-segment--remaining"
                            style={{ width: `${(remaining / totalLaps) * 100}%` }}
                        >
                            <span className="stint-segment__label stint-segment__label--dim">
                                {remaining > 3 && `${remaining}L`}
                            </span>
                        </div>
                    )}
                </div>
                <div className="stint-timeline__labels">
                    <span>Lap 1</span>
                    <span>Lap {totalLaps}</span>
                </div>
            </div>

            {/* ── Stint Editor Rows ───────────────────────────────────── */}
            <div className="stint-editor">
                {stints.map((stint, i) => {
                    const meta = COMPOUND_META[stint.compound] || { color: '#555', icon: '⚫', label: stint.compound };
                    return (
                        <div className="stint-row" key={i} style={{ '--stint-color': meta.color }}>
                            <div className="stint-row__number">
                                <span className="stint-row__badge">STINT {i + 1}</span>
                            </div>

                            <div className="stint-row__compound-selector">
                                {availableCompounds.map(c => {
                                    const cm = COMPOUND_META[c] || { icon: '⚫', label: c, color: '#555' };
                                    const active = stint.compound === c;
                                    return (
                                        <button
                                            key={c}
                                            className={`compound-btn ${active ? 'compound-btn--active' : ''}`}
                                            style={active ? { borderColor: cm.color, background: `${cm.color}18` } : {}}
                                            onClick={() => updateStint(i, 'compound', c)}
                                        >
                                            <span className="compound-btn__icon">{cm.icon}</span>
                                            <span className="compound-btn__label">{cm.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="stint-row__laps">
                                <label className="stint-row__laps-label">LAPS</label>
                                <input
                                    type="number"
                                    className="stint-row__laps-input"
                                    min={1}
                                    max={totalLaps}
                                    value={stint.laps}
                                    onChange={e => updateStint(i, 'laps', Math.max(1, parseInt(e.target.value) || 1))}
                                />
                            </div>

                            <div className="stint-row__time">
                                <span className="stint-row__time-label">STINT TIME</span>
                                <span className="stint-row__time-value">
                                    {stintTimes[i] ? formatRaceTime(stintTimes[i]) : '—'}
                                </span>
                            </div>

                            <button
                                className="stint-row__remove"
                                onClick={() => removeStint(i)}
                                disabled={stints.length <= 1}
                                title="Remove stint"
                            >
                                ✕
                            </button>
                        </div>
                    );
                })}

                <button className="stint-add-btn" onClick={addStint}>
                    <span className="stint-add-btn__icon">＋</span>
                    Add Stint (Pit Stop)
                </button>
            </div>

            {/* ── Summary Panel ───────────────────────────────────────── */}
            <div className="strategy-summary">
                <div className="strategy-summary__item">
                    <span className="strategy-summary__label">TOTAL LAPS</span>
                    <span className={`strategy-summary__value ${remaining !== 0 ? 'strategy-summary__value--warn' : ''}`}>
                        {usedLaps} / {totalLaps}
                        {remaining > 0 && <span className="strategy-summary__note"> ({remaining} remaining)</span>}
                        {remaining < 0 && <span className="strategy-summary__note strategy-summary__note--over"> ({Math.abs(remaining)} over!)</span>}
                    </span>
                </div>
                <div className="strategy-summary__item">
                    <span className="strategy-summary__label">PIT STOPS</span>
                    <span className="strategy-summary__value">{pitStops}</span>
                </div>
                <div className="strategy-summary__item">
                    <span className="strategy-summary__label">PIT TIME LOSS</span>
                    <span className="strategy-summary__value">{(pitStops * PIT_STOP_LOSS_SEC).toFixed(0)}s</span>
                </div>
                <div className="strategy-summary__item strategy-summary__item--highlight">
                    <span className="strategy-summary__label">PREDICTED RACE TIME</span>
                    <span className="strategy-summary__value strategy-summary__value--big">
                        {remaining === 0 ? formatRaceTime(totalTime) : '—'}
                    </span>
                    {remaining !== 0 && (
                        <span className="strategy-summary__hint">
                            Fill all {totalLaps} laps to see predicted time
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
