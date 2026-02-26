import React, { useState, useEffect } from 'react';

const FimTable = ({ agentId = '001' }) => {
  const [fimData, setFimData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fungsi untuk mengambil data dari backend Express.js Anda
    const fetchFimData = async () => {
      try {
        setLoading(true);
        // Ganti URL ini dengan URL backend Express Anda
        const response = await fetch(`http://localhost:3000/api/fim/${agentId}`);
        const result = await response.json();

        if (result.success) {
          setFimData(result.data);
        } else {
          setError(result.message || 'Gagal mengambil data');
        }
      } catch (err) {
        setError('Terjadi kesalahan jaringan');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchFimData();
  }, [agentId]); // Akan re-fetch jika agentId berubah

  // Tampilan saat loading
  if (loading) return <div className="p-4 text-center">Memuat data Syscheck...</div>;
  
  // Tampilan saat error
  if (error) return <div className="p-4 text-red-500 text-center">Error: {error}</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto font-sans">
      <h2 className="text-2xl font-bold mb-4">File Integrity Monitoring (Agent: {agentId})</h2>
      
      <div className="overflow-x-auto shadow-md sm:rounded-lg">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-100">
            <tr>
              <th className="px-6 py-3">File Path</th>
              <th className="px-6 py-3">Size (Bytes)</th>
              <th className="px-6 py-3">Owner (User/Group)</th>
              <th className="px-6 py-3">Last Modified</th>
              <th className="px-6 py-3">MD5 Hash</th>
            </tr>
          </thead>
          <tbody>
            {fimData.length > 0 ? (
              fimData.map((item, index) => (
                <tr key={index} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900 break-all">
                    {item.file}
                  </td>
                  <td className="px-6 py-4">
                    {item.size}
                  </td>
                  <td className="px-6 py-4">
                    {item.uname} / {item.gname}
                  </td>
                  <td className="px-6 py-4">
                    {/* Format tanggal agar lebih mudah dibaca */}
                    {new Date(item.mtime).toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs break-all">
                    {item.md5}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                  Tidak ada data file yang dipantau.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FimTable;