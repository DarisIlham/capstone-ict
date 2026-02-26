import React, { useState, useEffect } from 'react';

const FimEvents = ({ agentId = '001' }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3000/api/events/${agentId}`);
      const result = await response.json();
      if (result.success) setEvents(result.data);
      else setError(result.message);
    } catch (err) {
      console.error("Detail error:", err)
      setError('Gagal menghubungi backend API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [agentId]);

  const formatTime = (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
    }).replace(',', '').replace('AM', '').replace('PM', ''); 
  };

  // --- FUNGSI BARU: Menerjemahkan Angka ke Teks Kategori (Severity) ---
  const renderSeverityBadge = (level) => {
    if (level >= 12) return <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Critical (Lvl {level})</span>;
    if (level >= 8)  return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-bold">High (Lvl {level})</span>;
    if (level >= 5)  return <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold">Medium (Lvl {level})</span>;
    return <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Low (Lvl {level})</span>;
  };

  if (loading) return <div className="p-8 text-center text-gray-600">Loading Events Data...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans">
      <div className="border-b border-gray-200 px-4 pt-3 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold text-lg mr-4">W.</span>
          <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full">File Integrity M...</span>
          <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">agent{agentId}</span>
        </div>
      </div>

      <div className="p-4 bg-gray-50 flex flex-col gap-4">
        {/* Tombol Refresh */}
        <div className="flex items-center gap-2 bg-white p-2 border border-gray-300 rounded shadow-sm">
          <button onClick={fetchEvents} className="text-blue-600 text-sm font-medium px-3 flex items-center gap-1">
             Refresh Data
          </button>
        </div>

        {/* Tabel Area */}
        <div className="bg-white border border-gray-200 mt-2">
          <div className="text-center py-2 border-b border-gray-200 text-sm">
             <span className="font-bold">{events.length}</span> hits
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-100 text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 font-semibold">↓ timestamp</th>
                  <th className="px-3 py-2 font-semibold">agent.name</th>
                  <th className="px-3 py-2 font-semibold">username</th>
                  <th className="px-3 py-2 font-semibold">syscheck.path</th>
                  <th className="px-3 py-2 font-semibold">syscheck.event</th>
                  <th className="px-3 py-2 font-semibold">payload</th> {/* Ini tadinya rule.description */}
                  <th className="px-3 py-2 font-semibold">severity alert</th> {/* Ini sekarang mengecek level */}
                </tr>
              </thead>
              <tbody>
                {events.length > 0 ? (
                  events.map((evt) => (
                    <tr key={evt.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600">{formatTime(evt.timestamp)}</td>
                      <td className="px-3 py-2 text-blue-600">{evt.agentName}</td>
                      <td className="px-3 py-2 text-purple-600 font-medium">{evt.username}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono text-xs">{evt.syscheckPath}</td>
                      <td className="px-3 py-2">{evt.syscheckEvent}</td>
                      {/* --- KOLOM PAYLOAD (Menampilkan Deskripsi & Diff ala GitHub) --- */}
                      <td className="px-3 py-2 text-gray-600 align-top max-w-md">
                        <div className="font-semibold">{evt.ruleDescription}</div>
                        
                        {/* Jika ada perubahan isi file (diff), tampilkan kotak kode */}
                        {evt.fileDiff && (
                          <div className="mt-2 p-2 bg-gray-900 text-gray-300 rounded overflow-x-auto text-xs font-mono border border-gray-700 shadow-inner">
                            {/* Memisahkan baris agar bisa diberi warna ala GitHub */}
                            {evt.fileDiff.split('\n').map((line, index) => {
                              // Baris yang ditambah (hijau)
                              if (line.startsWith('>')) {
                                return <div key={index} className="text-green-400 bg-green-900/30 px-1">+ {line.substring(1)}</div>;
                              }
                              // Baris yang dihapus (merah)
                              if (line.startsWith('<')) {
                                return <div key={index} className="text-red-400 bg-red-900/30 px-1">- {line.substring(1)}</div>;
                              }
                              // Baris informasi baris (biru)
                              if (line.match(/^\d+c\d+/)) {
                                return <div key={index} className="text-blue-400 mt-1 mb-1">@@ {line} @@</div>;
                              }
                              // Teks biasa
                              return <div key={index} className="px-1">{line}</div>;
                            })}
                          </div>
                        )}
                      </td>
                      
                      {/* --- Menampilkan Kategori Severity dengan Warna --- */}
                      <td className="px-3 py-2">
                        {renderSeverityBadge(evt.ruleLevel)}
                      </td>
                      
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="px-3 py-4 text-center text-gray-500">
                      Tidak ada event FIM ditemukan.
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