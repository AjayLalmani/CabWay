import React, { useEffect, useState } from 'react';
import { fetchTripHistory } from '../lib/api';
import { useAuth } from '@clerk/clerk-react';

export default function RideHistory({ role = 'rider' }) {
  const { getToken } = useAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getHistory() {
      try {
        const token = await getToken();
        if (token) {
          const history = await fetchTripHistory(token, role);
          setRides(history);
        }
      } catch (err) {
        console.error("Failed to load history", err);
      } finally {
        setLoading(false);
      }
    }
    getHistory();
  }, [getToken, role]);

  if (loading) return <div className="p-4 text-gray-500">Loading history...</div>;

  if (rides.length === 0) return (
    <div className="p-6 text-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-100">
      No past rides found.
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-800">Trip History</h3>
      </div>
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {rides.map(ride => (
          <div key={ride.id} className="p-4 hover:bg-gray-50 transition-colors flex justify-between items-center">
            <div>
              <p className="font-medium text-gray-800 text-sm">
                {new Date(ride.created_at).toLocaleDateString()} at {new Date(ride.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="text-xs text-gray-500 mt-1 flex flex-col gap-1">
                <span><strong className='text-gray-700'>From:</strong> {ride.pickup_address || 'Custom Location'}</span>
                <span><strong className='text-gray-700'>To:</strong> {ride.dropoff_address || 'Custom Location'}</span>
              </div>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="font-bold text-gray-800">${(ride.fare_amount / 100).toFixed(2)}</span>
              <span className={`text-xs px-2 py-1 rounded-full mt-2 font-medium
                ${ride.status === 'completed' ? 'bg-green-100 text-green-700' : 
                  ride.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                {ride.status.charAt(0).toUpperCase() + ride.status.slice(1)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
