import React, { useState, useEffect } from 'react';

const FimEvents = ({ agentId = '001' }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fungsi untuk memanggil API backend
  const fetchEvents = async () => {
    try {
      setLoading(true);
      // Panggil route Express.js baru Anda
      const response = await fetch(`http://localhost:3000/api/events/${agentId}`);
      const result = await response.json();

      if (result.success) {
        setEvents(result.data);
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error(err);
      setError('Gagal menghubungi backend API');
    } finally {
      setLoading(false);
    }
  };

  // Otomatis fetch saat komponen dimuat
  useEffect(() => {
    fetchEvents();
  }, [agentId]);

  // Fungsi untuk memformat timestamp (ISO) agar persis seperti di Wazuh
  const formatTime = (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
    }).replace(',', '').replace('AM', '').replace('PM', ''); 
    // Format simpel menyerupai: Feb 25 2026 @ 09:30:33.512
  };

  if (loading) return <div className="p-8 text-center text-gray-600">Loading Events Data...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans">
      {/* 1. Header & Navigation Tabs */}
      <div className="border-b border-gray-200 px-4 pt-3 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold text-lg mr-4">W.</span>
          <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full">File Integrity M...</span>
          <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">agent{agentId}</span>
        </div>
        
        <div className="flex gap-6 text-sm font-medium mt-2">
          <button className="pb-2 text-gray-500 hover:text-gray-700">Dashboard</button>
          <button className="pb-2 text-gray-500 hover:text-gray-700">Inventory</button>
          <button className="pb-2 text-blue-600 border-b-2 border-blue-600">Events</button>
        </div>
      </div>

      <div className="p-4 bg-gray-50 flex flex-col gap-4">
        {/* 2. Search & Filter Bar */}
        <div className="flex items-center gap-2 bg-white p-2 border border-gray-300 rounded shadow-sm">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          <input type="text" placeholder="Search" className="flex-1 outline-none text-sm" />
          <span className="text-blue-600 text-xs font-semibold px-2 border-r border-gray-300">DQL</span>
          <div className="flex items-center gap-2 px-2 text-sm text-gray-600 border-r border-gray-300">
            Last 24 hours
          </div>
          <button onClick={fetchEvents} className="text-blue-600 text-sm font-medium px-3 border-l border-gray-300 flex items-center gap-1">
             Refresh
          </button>
        </div>

        {/* 3. Active Filters Tags */}
        <div className="flex gap-2 text-xs">
          <span className="border border-gray-300 bg-white px-2 py-1 rounded text-gray-700">manager.name: wazuh</span>
          <span className="border border-gray-300 bg-white px-2 py-1 rounded text-gray-700">rule.groups: syscheck</span>
          <span className="border border-gray-300 bg-white px-2 py-1 rounded text-gray-700">agent.id: {agentId}</span>
        </div>

        {/* 4. Table Area */}
        <div className="bg-white border border-gray-200 mt-2">
          <div className="text-center py-2 border-b border-gray-200 text-sm">
             <span className="font-bold">{events.length}</span> hits
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-100 text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 font-semibold"></th>
                  <th className="px-3 py-2 font-semibold">↓ timestamp</th>
                  <th className="px-3 py-2 font-semibold">agent.name</th>
                  {/* Tambahan Header Username */}
                  <th className="px-3 py-2 font-semibold">username</th> 
                  <th className="px-3 py-2 font-semibold">syscheck.path</th>
                  <th className="px-3 py-2 font-semibold">syscheck.event</th>
                  <th className="px-3 py-2 font-semibold">pilot</th>
                  <th className="px-3 py-2 font-semibold">rule.level</th>
                  <th className="px-3 py-2 font-semibold">severity</th>
                </tr>
              </thead>
              <tbody>
                {events.length > 0 ? (
                  events.map((evt) => (
                    <tr key={evt.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-blue-500 cursor-pointer text-lg">🔍</td>
                      <td className="px-3 py-2 text-gray-600">{formatTime(evt.timestamp)}</td>
                      <td className="px-3 py-2 text-blue-600">{evt.agentName}</td>
                      
                      {/* Tambahan Data Username */}
                      <td className="px-3 py-2 text-purple-600 font-medium">{evt.username}</td>
                      
                      <td className="px-3 py-2 text-gray-600 font-mono text-xs">{evt.syscheckPath}</td>
                      <td className="px-3 py-2">{evt.syscheckEvent}</td>
                      <td className="px-3 py-2 text-gray-600">{evt.ruleDescription}</td>
                      <td className="px-3 py-2">{evt.ruleLevel}</td>
                      <td className="px-3 py-2 text-blue-600">{evt.ruleId}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    {/* Ubah colSpan dari 8 menjadi 9 karena ada kolom baru */}
                    <td colSpan="9" className="px-3 py-4 text-center text-gray-500">
                      Tidak ada event FIM ditemukan untuk agent ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FimEvents;