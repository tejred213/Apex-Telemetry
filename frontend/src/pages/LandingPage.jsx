import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LandingNavbar from '../components/LandingNavbar';
import Footer from '../components/Footer';

function LandingPage() {
  const [imagesMap, setImagesMap] = useState({
    hero: '',
    trace: ''
  });

  useEffect(() => {
    // Find dynamic image names since they have timestamps
    fetch('/')
      .then(() => {
        // Just mocking the image load, we'll try to use wildcard or assume the path exists
      });
  }, []);

  return (
    <div className="landing-page">
      <LandingNavbar />

      {/* Hero Section */}
      <section className="hero">
        <div className="hero__background-grid"></div>
        <div className="hero__container">
          
          <div className="hero__content-left">
            <div className="hero__tag">
              <span className="tag-dot"></span> TELEMETRY ANALYSIS V1.0
            </div>
            
            <h1 className="hero__headline">
              <em>INCREASE YOUR <span className="text-red">RACE KNOWLEDGE</span><br/>EVERY RACE</em>
            </h1>
            
            <p className="hero__subtitle">
              Unlock your true understanding of the sport with sector-by-sector analysis, throttle telemetry, and pro-level lap comparisons. 
              <br/>
              Increase your knowledge of the sport and become a better fan.
            </p>
            
            <div className="hero__cta-group">
              <Link to="/compare" className="btn btn--primary btn--hero">
                Compare Laps &rarr;
              </Link>
              <Link to="/strategy" className="btn btn--secondary btn--hero" style={{ marginLeft: '1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>
                Race Strategy &rarr;
              </Link>
            </div>
            
            <div className="hero__social-proof">
              <span>Used by <strong className="text-red">FORMULA 1 FANS</strong> worldwide</span>
            </div>
          </div>
          
          <div className="hero__content-right">
            <div className="hero__image-card">
              <div className="hero__image-wrapper">
                {/* Dynamically looking for the generated hero image */}
                <img src="/assets/images/hero_f1_car_1772040655009.png" alt="F1 Car" className="hero__car-img" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <div className="hero__live-telemetry">
                <div className="telemetry-header">
                  <div className="telemetry-status">
                    <span className="status-dot"></span> LIVE TELEMETRY
                  </div>
                  <div className="telemetry-venue text-red">MONZA GP</div>
                </div>
                <div className="telemetry-bars">
                  <div className="telemetry-bars-col">
                    <div className="t-bar">
                      <div className="t-label">THROTTLE</div>
                      <div className="bar-track"><div className="bar-fill bar-fill--throttle" style={{width: '85%'}}></div></div>
                      <div className="t-value">85%</div>
                    </div>
                  </div>
                  <div className="telemetry-bars-col">
                    <div className="t-bar">
                      <div className="t-label">BRAKE</div>
                      <div className="bar-track"><div className="bar-fill bar-fill--brake" style={{width: '12%'}}></div></div>
                      <div className="t-value">12%</div>
                    </div>
                  </div>
                  <div className="telemetry-speed">
                    <div className="t-label">SPEED</div>
                    <div className="speed-val">284 <span className="unit">KM/H</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Stats Divider (Modified to not have fake numbers as requested) */}
      <section className="stats-divider">
        <div className="stats-container">
          {/* Group 1 */}
          <div className="stats-marquee-group">
            <div className="stat-item">
              <h3 className="stat-title"><em>RACE STRATEGY</em></h3>
              <p className="stat-desc">MLX PREDICTIONS</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-title"><em>3D SIMULATION</em></h3>
              <p className="stat-desc">LIVE RACE REPLAY</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-title"><em>SECTOR ANALYSIS</em></h3>
              <p className="stat-desc">COMPARE DELTAS</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-title"><em>TELEMETRY</em></h3>
              <p className="stat-desc">THROTTLE & BRAKE</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-title"><em>TRACK MAPS</em></h3>
              <p className="stat-desc">DOMINANCE ZONES</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-title"><em>SPEED TRAPS</em></h3>
              <p className="stat-desc">TOP SPEEDS</p>
            </div>
          </div>

          {/* Group 2 (Duplicate for seamless loop) */}
          <div className="stats-marquee-group" aria-hidden="true">
            <div className="stat-item">
              <h3 className="stat-title"><em>RACE STRATEGY</em></h3>
              <p className="stat-desc">MLX PREDICTIONS</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-title"><em>3D SIMULATION</em></h3>
              <p className="stat-desc">LIVE RACE REPLAY</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-title"><em>SECTOR ANALYSIS</em></h3>
              <p className="stat-desc">COMPARE DELTAS</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-title"><em>TELEMETRY</em></h3>
              <p className="stat-desc">THROTTLE & BRAKE</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-title"><em>TRACK MAPS</em></h3>
              <p className="stat-desc">DOMINANCE ZONES</p>
            </div>
            <div className="stat-item">
              <h3 className="stat-title"><em>SPEED TRAPS</em></h3>
              <p className="stat-desc">TOP SPEEDS</p>
            </div>
          </div>
        </div>
      </section>

      {/* Insights Section */}
      <section className="insights">
        <div className="insights__container">
          <div className="insights__header">
            <h2><em>TOP OF THE LINE <span className="text-red">FEATURES</span></em></h2>
            <p>Our platform processes raw telemetry data into actionable visuals, helping you understand the sport better. Stop guessing and start knowing.</p>
          </div>

          <div className="insights__grid">
            {/* Card 1 */}

            <div className="insight-card">
              <div className="insight-card__image gradient-bg-1">
                <img src="/assets/images/feature_trace_1772040722082.png" alt="Trace" onError={(e) => { e.target.style.display = 'none'; }} />
                <div className="card-tag text-red">FIG 1.1 TRACE</div>
              </div>
              <div className="insight-card__content">
                <h3>Throttle Trace Analysis</h3>
                <p>Visualization of the throttle - brake patterns by world's best drivers, helps you understand the sport better.
                </p>
              </div>
            </div>
            

            {/* Card 2 */}
            <div className="insight-card">
              <div className="insight-card__image gradient-bg-3" style={{ objectFit: 'cover' }}>
                <img src="/assets/images/image.png" onError={(e) => { e.target.style.display = 'none'; }} />
                <div className="card-tag text-red">FIG 1.2 DELTAS</div>
              </div>
              <div className="insight-card__content">
                <h3>Track Dominance</h3>
                <p>Track Dominance shows which Driver-Car combo dominates which part of the track.</p>
              </div>
            </div>

            {/* Card 3: Predictive Race Strategy */}
            <div className="insight-card">
              <div className="insight-card__image gradient-bg-2" style={{ objectFit: 'cover' }}>
                <img src="/assets/images/Simulation 2.png" alt="Strategy Simulation" onError={(e) => { e.target.style.display = 'none'; }} />
                <div className="card-tag text-red">FIG 1.3 SIMULATION</div>
              </div>
              <div className="insight-card__content">
                <h3>Predictive Race Strategy</h3>
                <p>Build custom stint strategies and visualize them on a 3D track map alongside actual race driver data using our MLX-powered engine.</p>
              </div>
            </div>

            {/* Card 4: Top Speed Traps */}
            <div className="insight-card">
              <div className="insight-card__image gradient-bg-1" style={{ objectFit: 'cover' }}>
                <img src="/assets/images/speed_trap_chart.png" alt="Top Speed" onError={(e) => { e.target.style.display = 'none'; }} />
                <div className="card-tag text-red">FIG 1.4 SPEED TRAP</div>
              </div>
              <div className="insight-card__content">
                <h3>Top Speed Traps</h3>
                <p>Analyze terminal velocities on the longest straights to understand aerodynamic efficiency and engine deployment.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

export default LandingPage;
