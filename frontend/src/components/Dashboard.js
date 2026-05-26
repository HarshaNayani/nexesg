import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'https://breathe-esg-5hgc.onrender.com/api';

function Dashboard() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({});
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  useEffect(() => {
    fetchRecords();
    fetchSummary();
  }, [statusFilter, sourceFilter]);

  const fetchRecords = async () => {
    try {
      let url = `${API}/emissions/?`;
      if (statusFilter) url += `status=${statusFilter}&`;
      if (sourceFilter) url += `source=${sourceFilter}&`;
      const res = await axios.get(url);
      setRecords(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await axios.get(`${API}/emissions/summary/`);
      setSummary(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprove = async (id) => {
    await axios.post(`${API}/emissions/${id}/approve/`, { reviewed_by: 'analyst' });
    fetchRecords();
    fetchSummary();
  };

  const handleFlag = async (id) => {
    const notes = prompt('Enter reason for flagging:');
    await axios.post(`${API}/emissions/${id}/flag/`, { reviewed_by: 'analyst', notes });
    fetchRecords();
    fetchSummary();
  };

  const handleReject = async (id) => {
    const notes = prompt('Enter reason for rejection:');
    await axios.post(`${API}/emissions/${id}/reject/`, { reviewed_by: 'analyst', notes });
    fetchRecords();
    fetchSummary();
  };

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>📊 Analyst Dashboard</h2>

      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>{summary.total || 0}</h3>
          <p>Total Records</p>
        </div>
        <div className="stat-card pending">
          <h3>{summary.pending || 0}</h3>
          <p>Pending Review</p>
        </div>
        <div className="stat-card approved">
          <h3>{summary.approved || 0}</h3>
          <p>Approved</p>
        </div>
        <div className="stat-card flagged">
          <h3>{summary.flagged || 0}</h3>
          <p>Flagged</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="filter-bar">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="FLAGGED">Flagged</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            <option value="">All Sources</option>
            <option value="SAP">SAP</option>
            <option value="UTILITY">Utility</option>
            <option value="TRAVEL">Travel</option>
          </select>
          <button
            className="action-btn approve-btn"
            onClick={() => { setStatusFilter(''); setSourceFilter(''); }}
          >
            Clear Filters
          </button>
        </div>

        {/* Records Table */}
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Source</th>
              <th>Scope</th>
              <th>Description</th>
              <th>Quantity</th>
              <th>CO2e (kg)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#666' }}>
                  No records found. Upload data to get started!
                </td>
              </tr>
            ) : (
              records.map(record => (
                <tr key={record.id}>
                  <td>{record.activity_date}</td>
                  <td><span className={`badge ${record.source}`}>{record.source}</span></td>
                  <td>{record.scope}</td>
                  <td>{record.description}</td>
                  <td>{record.normalized_quantity} {record.normalized_unit}</td>
                  <td>{record.co2_equivalent?.toFixed(2)}</td>
                  <td><span className={`badge ${record.status}`}>{record.status}</span></td>
                  <td>
                    {!record.locked_for_audit ? (
                      <>
                        <button className="action-btn approve-btn" onClick={() => handleApprove(record.id)}>✓</button>
                        <button className="action-btn flag-btn" onClick={() => handleFlag(record.id)}>⚑</button>
                        <button className="action-btn reject-btn" onClick={() => handleReject(record.id)}>✗</button>
                      </>
                    ) : (
                      <span style={{ color: '#10b981', fontSize: '12px' }}>🔒 Locked</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;