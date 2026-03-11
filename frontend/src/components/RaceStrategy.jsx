import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    ReferenceLine,
    Area,
    AreaChart,
} from 'recharts';

// ─── Compound metadata ───────────────────────────────────────────────────────
const COMPOUND_META = {
    SOFT:   { label: 'Soft',   color: '#E10600', icon: '🔴' },
    MEDIUM: { label: 'Medium', color: '#FFC700', icon: '🟡' },
    HARD:   { label: 'Hard',   color: '#CCCCCC', icon: '⚪' },
};

const GRID_COLOR   = 'rgba(255,255,255,0.06)';
const TICK_STYLE   = { fill: '#777', fontSize: 11, fontFamily: 'Inter' };
const CHART_MARGIN = { top: 12, right: 24, left: 8, bottom: 8 };

// Format seconds as M:SS.mmm
function formatLapTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
function StrategyTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;

    return (
        <div className="strategy-tooltip">
            <div className="strategy-tooltip__title">Lap {label} on tire</div>
            {payload.map((entry, i) => (
                <div
                    className="strategy-tooltip__row"
                    key={i}
                    style={{ color: entry.color }}
                >
                    <span className="strategy-tooltip__dot" style={{ background: entry.color }} />
                    <span className="strategy-tooltip__name">{entry.name}</span>
                    <span className="strategy-tooltip__val">{formatLapTime(entry.value)}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function RaceStrategy({ data, sessionLabel }) {
    if (!data || !data.compounds) return null;

    const compounds = data.compounds;
    const compoundKeys = Object.keys(compounds);

    // ── Build unified chart data ──────────────────────────────────────────
    // Determine max stint length across all compounds
    const maxLen = Math.max(
        ...compoundKeys.map(k => compounds[k].curve.length)
    );

    // Degradation delta chart data
    const deltaChartData = [];
    for (let i = 0; i < maxLen; i++) {
        const point = { lap: i };
        for (const c of compoundKeys) {
            const curve = compounds[c].curve;
            if (i < curve.length) {
                point[`delta_${c}`] = curve[i].delta;
            }
        }
        deltaChartData.push(point);
    }

    // Predicted lap time chart data
    const predictedChartData = [];
    for (let i = 0; i < maxLen; i++) {
        const point = { lap: i };
        for (const c of compoundKeys) {
            const curve = compounds[c].curve;
            if (i < curve.length) {
                point[`pred_${c}`] = curve[i].predicted;
            }
        }
        predictedChartData.push(point);
    }

    // Y-axis domain for predicted lap times
    const allPredicted = compoundKeys.flatMap(c =>
        compounds[c].curve.map(p => p.predicted)
    );
    const minPred = Math.floor(Math.min(...allPredicted) * 2) / 2;
    const maxPred = Math.ceil(Math.max(...allPredicted) * 2) / 2;

    // Max delta for domain
    const allDeltas = compoundKeys.flatMap(c =>
        compounds[c].curve.map(p => p.delta)
    );
    const maxDelta = Math.ceil(Math.max(...allDeltas, 1) * 2) / 2;

    return (
        <div className="strategy-section fade-in stagger-2">

            {/* ── Compound summary cards ──────────────────────────────── */}
            <div className="strategy-compound-cards">
                {compoundKeys.map(c => {
                    const meta = COMPOUND_META[c] || { label: c, color: '#fff', icon: '⚫' };
                    const comp = compounds[c];
                    const lastDelta = comp.curve[comp.curve.length - 1]?.delta ?? 0;
                    return (
                        <div
                            className="strategy-compound-card"
                            key={c}
                            style={{ '--compound-color': meta.color }}
                        >
                            <div className="strategy-compound-card__header">
                                <span className="strategy-compound-card__icon">{meta.icon}</span>
                                <span className="strategy-compound-card__name">{meta.label}</span>
                            </div>
                            <div className="strategy-compound-card__baseline">
                                <span className="strategy-compound-card__label">BASELINE</span>
                                <span className="strategy-compound-card__value">
                                    {formatLapTime(comp.baseline)}
                                </span>
                            </div>
                            <div className="strategy-compound-card__deg">
                                <span className="strategy-compound-card__label">DEG @ {comp.curve.length - 1} LAPS</span>
                                <span className="strategy-compound-card__value strategy-compound-card__value--red">
                                    +{lastDelta.toFixed(3)}s
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Predicted Lap Time Chart ────────────────────────────── */}
            <div className="strategy-chart-panel">
                <div className="strategy-chart-panel__header">
                    <span className="strategy-chart-panel__title">PREDICTED LAP TIME</span>
                    <span className="strategy-chart-panel__unit">seconds</span>
                </div>
                <div className="strategy-chart-panel__body" style={{ height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={predictedChartData} margin={CHART_MARGIN}>
                            <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                            <XAxis
                                dataKey="lap"
                                type="number"
                                domain={[0, maxLen - 1]}
                                tick={TICK_STYLE}
                                tickLine={false}
                                axisLine={false}
                                label={{
                                    value: 'Laps on Tire',
                                    position: 'insideBottomRight',
                                    offset: -4,
                                    fill: '#555',
                                    fontSize: 11,
                                }}
                            />
                            <YAxis
                                domain={[minPred, maxPred]}
                                tick={TICK_STYLE}
                                tickLine={false}
                                axisLine={false}
                                width={58}
                                tickFormatter={v => { const m = Math.floor(v / 60); const s = v % 60; return `${m}:${s.toFixed(0).padStart(2, '0')}`; }}
                            />
                            <Tooltip content={<StrategyTooltip />} />
                            {compoundKeys.map(c => (
                                <Line
                                    key={c}
                                    type="monotone"
                                    dataKey={`pred_${c}`}
                                    name={COMPOUND_META[c]?.label || c}
                                    stroke={COMPOUND_META[c]?.color || '#fff'}
                                    strokeWidth={2.5}
                                    dot={false}
                                    activeDot={{ r: 5, strokeWidth: 0 }}
                                    isAnimationActive={true}
                                    animationDuration={1200}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ── Degradation Delta Chart ─────────────────────────────── */}
            <div className="strategy-chart-panel">
                <div className="strategy-chart-panel__header">
                    <span className="strategy-chart-panel__title">DEGRADATION DELTA</span>
                    <span className="strategy-chart-panel__unit">Δ seconds vs baseline</span>
                </div>
                <div className="strategy-chart-panel__body" style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={deltaChartData} margin={CHART_MARGIN}>
                            <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                            <XAxis
                                dataKey="lap"
                                type="number"
                                domain={[0, maxLen - 1]}
                                tick={TICK_STYLE}
                                tickLine={false}
                                axisLine={false}
                                label={{
                                    value: 'Laps on Tire',
                                    position: 'insideBottomRight',
                                    offset: -4,
                                    fill: '#555',
                                    fontSize: 11,
                                }}
                            />
                            <YAxis
                                domain={[0, maxDelta]}
                                tick={TICK_STYLE}
                                tickLine={false}
                                axisLine={false}
                                width={42}
                                tickFormatter={v => `+${v.toFixed(1)}`}
                            />
                            <Tooltip content={<StrategyTooltip />} />
                            <ReferenceLine
                                y={0}
                                stroke="rgba(255,255,255,0.1)"
                                strokeDasharray="4 3"
                            />
                            {compoundKeys.map(c => (
                                <Area
                                    key={c}
                                    type="monotone"
                                    dataKey={`delta_${c}`}
                                    name={COMPOUND_META[c]?.label || c}
                                    stroke={COMPOUND_META[c]?.color || '#fff'}
                                    fill={COMPOUND_META[c]?.color || '#fff'}
                                    fillOpacity={0.08}
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                    isAnimationActive={true}
                                    animationDuration={1200}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ── Legend ──────────────────────────────────────────────── */}
            <div className="strategy-legend">
                {compoundKeys.map(c => (
                    <span className="strategy-legend__item" key={c}>
                        <span
                            className="strategy-legend__swatch"
                            style={{ background: COMPOUND_META[c]?.color || '#fff' }}
                        />
                        {COMPOUND_META[c]?.label || c}
                    </span>
                ))}
                <span className="strategy-legend__note">
                    Predictions generated by MLX neural network
                </span>
            </div>

            {/* ── Model info badge ────────────────────────────────────── */}
            {data.modelInfo && (
                <div className="strategy-model-badge fade-in stagger-3">
                    <div className="strategy-model-badge__icon">🧠</div>
                    <div className="strategy-model-badge__info">
                        <span className="strategy-model-badge__title">MLX Predictive Engine</span>
                        <span className="strategy-model-badge__desc">
                            {data.modelInfo.architecture} · {data.modelInfo.trainingSamples} training samples
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
