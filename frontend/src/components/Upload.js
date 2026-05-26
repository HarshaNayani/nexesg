import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'https://breathe-esg-5hgc.onrender.com/api';

function Upload() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [sapFile, setSapFile] = useState(null);
  const [utilityFile, setUtilityFile] = useState(null);
  const [travelFile, setTravelFile] = useState(null);
  const [messages, setMessages] = useState({ sap: '', utility: '', travel: '' });

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get(`${API}/companies/`);
      setCompanies(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompany) return;
    try {
      await axios.post(`${API}/companies/`, { name: newCompany });
      setNewCompany('');
      fetchCompanies();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async (type, file) => {
    if (!file || !selectedCompany) {
      setMessages(prev => ({ ...prev, [type.toLowerCase()]: 'Please select a company and file!' }));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('company_id', selectedCompany);

    try {
      const res = await axios.post(`${API}/emissions/upload_${type.toLowerCase()}/`, formData);
      setMessages(prev => ({
        ...prev,
        [type.toLowerCase()]: `✅ ${res.data.records_created} records uploaded successfully!`
      }));
    } catch (err) {
      setMessages(prev => ({
        ...prev,
        [type.toLowerCase()]: `❌ Upload failed! Check file format.`
      }));
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>📤 Upload Data</h2>

      {/* Company Selection */}
      <div className="card">
        <h3 style={{ marginBottom: '15px' }}>Select Company</h3>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Create new company..."
            value={newCompany}
            onChange={e => setNewCompany(e.target.value)}
            style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '5px', flex: 1 }}
          />
          <button className="action-btn approve-btn" onClick={handleCreateCompany}
            style={{ padding: '8px 20px' }}>
            + Add
          </button>
        </div>
        <select
          value={selectedCompany}
          onChange={e => setSelectedCompany(e.target.value)}
          style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '5px' }}
        >
          <option value="">-- Select Company --</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Upload Cards */}
      <div className="upload-grid">

        {/* SAP Upload */}
        <div className="upload-card">
          <h3>🏭 SAP Data</h3>
          <p>Fuel & Procurement data from SAP flat file export (CSV)</p>
          <p style={{ fontSize: '11px', color: '#999', marginBottom: '10px' }}>
            Required columns: date, description, quantity, unit
          </p>
          <input type="file" accept=".csv" onChange={e => setSapFile(e.target.files[0])} />
          <button className="upload-btn" onClick={() => handleUpload('sap', sapFile)}>
            Upload SAP File
          </button>
          {messages.sap && (
            <div className={messages.sap.includes('✅') ? 'success-msg' : 'error-msg'}>
              {messages.sap}
            </div>
          )}
        </div>

        {/* Utility Upload */}
        <div className="upload-card">
          <h3>⚡ Utility Data</h3>
          <p>Electricity data from utility portal CSV export</p>
          <p style={{ fontSize: '11px', color: '#999', marginBottom: '10px' }}>
            Required columns: billing_date, meter_id, kwh
          </p>
          <input type="file" accept=".csv" onChange={e => setUtilityFile(e.target.files[0])} />
          <button className="upload-btn" onClick={() => handleUpload('utility', utilityFile)}>
            Upload Utility File
          </button>
          {messages.utility && (
            <div className={messages.utility.includes('✅') ? 'success-msg' : 'error-msg'}>
              {messages.utility}
            </div>
          )}
        </div>

        {/* Travel Upload */}
        <div className="upload-card">
          <h3>✈️ Travel Data</h3>
          <p>Flight, hotel & ground transport data from Concur/Navan export</p>
          <p style={{ fontSize: '11px', color: '#999', marginBottom: '10px' }}>
            Required columns: travel_date, traveler, travel_type, distance_km
          </p>
          <input type="file" accept=".csv" onChange={e => setTravelFile(e.target.files[0])} />
          <button className="upload-btn" onClick={() => handleUpload('travel', travelFile)}>
            Upload Travel File
          </button>
          {messages.travel && (
            <div className={messages.travel.includes('✅') ? 'success-msg' : 'error-msg'}>
              {messages.travel}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default Upload;