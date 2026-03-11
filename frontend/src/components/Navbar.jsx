import { Link } from 'react-router-dom';

export default function Navbar({ sessionLabel }) {
    return (
        <nav className="navbar">
            <Link to="/" className="navbar__brand" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                <span><span className="accent">F1</span> Sector Analysis</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: '10px', fontWeight: '500', letterSpacing: '1px', marginTop: '4px' }}>
                  v{import.meta.env.VITE_APP_VERSION}
                </span>
            </Link>
            {sessionLabel && (
                <div className="navbar__session">
                    <span style={{ color: '#E10600', marginRight: 6 }}>●</span>
                    {sessionLabel}
                </div>
            )}
        </nav>
    );
}
