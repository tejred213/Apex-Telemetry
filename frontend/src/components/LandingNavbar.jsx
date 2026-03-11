import React from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="navbar navbar--landing">
      <div className="navbar__container">
        <Link to="/" className="navbar__logo">
          <span className="logo-icon"></span>
          <span className="logo-text">APEX<span className="text-red">TELEMETRY</span></span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: '8px', fontWeight: '500', letterSpacing: '1px', verticalAlign: 'super' }}>
            v{import.meta.env.VITE_APP_VERSION}
          </span>
        </Link>
        <div className="navbar__links">
          <Link to="/compare" className="navbar__link">Compare Laps</Link>
          <Link to="/strategy" className="navbar__link navbar__link--accent">🧠 Race Strategy</Link>
        </div>
      </div>
    </nav>
  );
}
