import { useState, useMemo, useCallback } from 'react';
import LandingNavbar from '../components/LandingNavbar';
import SessionSelector from '../components/SessionSelector';
import RaceStrategy from '../components/RaceStrategy';
import StrategyBuilder from '../components/StrategyBuilder';
import RaceSimulation3D from '../components/RaceSimulation3D';
import Footer from '../components/Footer';

function StrategyPage() {
  const [year, setYear] = useState(2024);
  const [gp, setGp] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [strategyData, setStrategyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Lifted stints state — shared between StrategyBuilder and RaceSimulation
  const [stints, setStints] = useState([]);

  const loadStrategy = useCallback(async () => {
    if (!gp) return;
    setLoading(true);
    setError('');
    setStrategyData(null);
    setStints([]);

    try {
      const loadRes = await fetch('/api/load-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, gp }),
      });
      await loadRes.json();

      const res = await fetch(
        `/api/strategy?year=${year}&gp=${encodeURIComponent(gp)}`
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Strategy data not available for this race.');
      }

      const data = await res.json();
      setStrategyData(data);
      setSessionLabel(`${year} ${gp} GP — Race Strategy`);

      // Initialize default stints from available compounds
      const compKeys = Object.keys(data.compounds || {});
      if (compKeys.length > 0) {
        const totalLaps = data.totalLaps || 57;
        setStints([
          { compound: compKeys[0], laps: Math.ceil(totalLaps / 2) },
          { compound: compKeys[compKeys.length > 1 ? 1 : 0], laps: Math.floor(totalLaps / 2) },
        ]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [year, gp]);

  return (
    <div className="app strategy-page">
      <LandingNavbar />
      <div className="hero__background-grid"></div>

      <div className="app-container">
        <SessionSelector
          year={year}
          gp={gp}
          setYear={setYear}
          setGp={setGp}
          onSessionLoaded={loadStrategy}
        />

        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <div className="loading-text">Loading race strategy data…</div>
          </div>
        )}

        {error && (
          <div className="empty-state">
            <div className="empty-state__icon">⚠️</div>
            <div className="empty-state__msg">{error}</div>
          </div>
        )}

        {strategyData && !loading && (
          <>
            <div className="strategy-hero fade-in">
              <div className="strategy-hero__tag">
                <span className="tag-dot"></span> MLX PREDICTIVE ENGINE
              </div>
              <h1 className="strategy-hero__title">
                <em>Tyre Degradation <span className="text-red">Analysis</span></em>
              </h1>
              <p className="strategy-hero__subtitle">
                Powered by an MLX neural network trained on {strategyData.modelInfo?.trainingSamples || '—'} race laps.
                Model architecture: {strategyData.modelInfo?.architecture || 'MLP'}.
              </p>
            </div>

            <div className="section-header fade-in stagger-1">
              <div className="accent-line" />
              <h2>Predicted Lap Time Degradation</h2>
            </div>

            <RaceStrategy data={strategyData} sessionLabel={sessionLabel} />

            <StrategyBuilder
              data={strategyData}
              stints={stints}
              setStints={setStints}
            />

            {strategyData.simulation && (
              <RaceSimulation3D
                simulation={strategyData.simulation}
                compounds={strategyData.compounds}
                stints={stints}
                totalLaps={strategyData.totalLaps}
              />
            )}
          </>
        )}

        {!strategyData && !loading && !error && (
          <div className="empty-state">
            <div className="empty-state__icon">🧠</div>
            <div className="empty-state__msg">
              Select a <strong>Season</strong> and <strong>Grand Prix</strong> above, then
              click <strong>Load Session</strong> to view the MLX-powered race strategy predictions.
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

export default StrategyPage;
