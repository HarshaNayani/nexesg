import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import Upload from './components/Upload';
import './App.css';

function App() {
  const [activePage, setActivePage] = useState('dashboard');

  return (
    <div className="app">
      <nav className="navbar">
        <h1>🌱 BreatheESG</h1>
        <div className="nav-links">
          <button
            className={activePage === 'dashboard' ? 'active' : ''}
            onClick={() => setActivePage('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={activePage === 'upload' ? 'active' : ''}
            onClick={() => setActivePage('upload')}
          >
            Upload Data
          </button>
        </div>
      </nav>

      <main className="main-content">
        {activePage === 'dashboard' && <Dashboard />}
        {activePage === 'upload' && <Upload />}
      </main>
    </div>
  );
}

export default App;