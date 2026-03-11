import React from 'react';

export default function Footer() {
  return (
    <footer className="footer-landing">
      <div className="footer-container">
        <div className="footer-logo">
          <span className="logo-icon"></span>
          APEX TELEMETRY
        </div>
        <div className="footer-copy">
          &copy; 2026 Apex Telemetry. All rights reserved.
        </div>
        <div className="footer-socials" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <span className="social-icon twitter"></span>
            <span className="social-icon github"></span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', letterSpacing: '1px' }}>
            V{import.meta.env.VITE_APP_VERSION}
          </div>
        </div>
      </div>
    </footer>
  );
}
