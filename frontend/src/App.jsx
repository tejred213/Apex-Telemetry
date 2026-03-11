import { Routes, Route } from 'react-router-dom';
import ComparePage from './pages/ComparePage';
import LandingPage from './pages/LandingPage';
import StrategyPage from './pages/StrategyPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/compare" element={<ComparePage />} />
      <Route path="/strategy" element={<StrategyPage />} />
    </Routes>
  );
}

export default App;
