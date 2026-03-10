const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Synchronize Clerk User to Supabase Backend
 */
export async function syncUserToDatabase(user, role = 'rider') {
  if (!user) return null;
  
  try {
    const res = await fetch(`${API_URL}/users/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress,
        first_name: user.firstName,
        last_name: user.lastName,
        role: role
      })
    });
    
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to sync user');
    }
    return await res.json();
  } catch (error) {
    console.error('User Sync Error:', error.message);
    throw error;
  }
}

/**
 * Create a new ride request
 */
export async function createRide(token, rideData) {
  try {
    const res = await fetch(`${API_URL}/rides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(rideData)
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to create ride');
    }
    return await res.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Accept a specific ride (Driver only)
 */
export async function acceptRide(token, rideId) {
  try {
    const res = await fetch(`${API_URL}/rides/${rideId}/accept`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!res.ok) throw new Error('Failed to accept ride');
    return await res.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Update the status of a ride (e.g., 'in_progress', 'completed')
 */
export async function updateRideStatus(token, rideId, status) {
  try {
    const res = await fetch(`${API_URL}/rides/${rideId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
    
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update ride status');
    }
    return await res.json();
  } catch (error) {
    console.error('API Error:', error.message);
    throw error;
  }
}

/**
 * Fetch ride history for the current user
 */
export async function fetchTripHistory(token, role = 'rider') {
  try {
    const res = await fetch(`${API_URL}/rides/history?role=${role}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!res.ok) throw new Error('Failed to fetch history');
    return await res.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Submit a rating and review for a completed ride
 */
export async function submitReview(token, rideId, rating, comment) {
  try {
    const res = await fetch(`${API_URL}/rides/${rideId}/rating`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ rating, comment })
    });
    
    if (!res.ok) throw new Error('Failed to submit review');
    return await res.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Fetch a driver's public profile and rating
 */
export async function getDriverProfile(token, driverId) {
  try {
    const res = await fetch(`${API_URL}/drivers/${driverId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error('Failed to fetch driver profile');
    return await res.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}
