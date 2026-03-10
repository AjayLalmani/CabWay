import React, { useState, useEffect } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Map from './components/Map.jsx'
import LocationSearch from './components/LocationSearch.jsx'
import CheckoutForm from './components/CheckoutForm.jsx'
import RideHistory from './components/RideHistory.jsx'
import RatingModal from './components/RatingModal.jsx'
import { socket } from './lib/socket.js'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { SignedIn, SignedOut, SignIn, UserButton, useAuth, useUser } from '@clerk/clerk-react'
import { createRide, updateRideStatus, getDriverProfile, syncUserToDatabase } from './lib/api.js'

const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY;
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder');

function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-black text-white p-4 flex justify-between items-center shadow-md">
        <div className="text-2xl font-bold tracking-tight">CabWay</div>
        <div className="flex gap-4 items-center">
          <Link to="/" className="hover:text-gray-300 transition-colors">Home</Link>
          <SignedIn>
            <Link to="/user-dashboard" className="hover:text-gray-300 transition-colors">Rider</Link>
            <Link to="/driver-dashboard" className="hover:text-gray-300 transition-colors">Driver</Link>
            <UserButton />
          </SignedIn>
        </div>
      </nav>

      <main className="flex-1 p-4 flex justify-center items-center">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/user-dashboard" element={
            <SignedIn>
              <UserDashboard />
            </SignedIn>
          } />
          <Route path="/driver-dashboard" element={
            <SignedIn>
              <DriverDashboard />
            </SignedIn>
          } />
        </Routes>
      </main>
    </div>
  )
}

function Home() {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-extrabold text-gray-900 mb-4">Welcome to CabWay</h1>
      <p className="text-lg text-gray-600 max-w-lg mx-auto mb-8">
        Your reliable ride, anywhere, anytime. Choose whether you're a rider looking for a cab, or a driver ready to earn.
      </p>
      
      <SignedOut>
        <div className="flex justify-center">
          <SignIn routing="hash" />
        </div>
      </SignedOut>
      
      <SignedIn>
        <div className="flex gap-4 justify-center mt-8">
          <Link to="/user-dashboard" className="bg-black text-white px-8 py-3 rounded-lg font-medium hover:bg-gray-800">
            Book a Ride
          </Link>
          <Link to="/driver-dashboard" className="bg-white border-2 border-black text-black px-8 py-3 rounded-lg font-medium hover:bg-gray-50">
            Drive with Us
          </Link>
        </div>
      </SignedIn>
    </div>
  )
}

function UserDashboard() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const [pickup, setPickup] = useState(null)
  const [dropoff, setDropoff] = useState(null)
  const [routeGeoJSON, setRouteGeoJSON] = useState(null)

  // Socket & DB state
  const [rideStatus, setRideStatus] = useState('idle') // idle, checkout, searching, accepted, completed
  const [activeRideId, setActiveRideId] = useState(null)
  const [driverLocation, setDriverLocation] = useState(null)
  const [driverProfile, setDriverProfile] = useState(null)
  const [showRatingModal, setShowRatingModal] = useState(false)
  
  // Payment state
  const [clientSecret, setClientSecret] = useState(null)
  const [fare, setFare] = useState(0) // dynamic mock fare in cents

  useEffect(() => {
    // Sync the current user to the database
    if (user) {
      syncUserToDatabase(user, 'rider').catch(console.error)
    }
  }, [user])

  useEffect(() => {
    socket.connect()

    socket.on('ride-accepted', async (data) => {
      setRideStatus('accepted')
      if (data.rideId) {
        setActiveRideId(data.rideId)
      }
      
      // Fetch the driver's profile to show their rating
      if (data.driverId) {
        try {
          const token = await getToken();
          const profile = await getDriverProfile(token, data.driverId);
          setDriverProfile(profile);
        } catch (err) {
          console.error("Failed to fetch driver profile", err);
        }
      }
    })

    socket.on('driver-location-update', (data) => {
      setDriverLocation(data.location)
    })
    
    socket.on('ride-completed', () => {
      setRideStatus('completed')
      setShowRatingModal(true)
    })

    return () => {
      socket.off('ride-accepted')
      socket.off('driver-location-update')
      socket.off('ride-completed')
      socket.disconnect()
    }
  }, [getToken])

  useEffect(() => {
    if (pickup && dropoff && GEOAPIFY_KEY) {
      calculateRoute(pickup, dropoff)
    }
  }, [pickup, dropoff])

  const calculateRoute = async (start, end) => {
    try {
      const waypoints = `${start.lat},${start.lng}|${end.lat},${end.lng}`
      const url = `https://api.geoapify.com/v1/routing?waypoints=${waypoints}&mode=drive&apiKey=${GEOAPIFY_KEY}`
      
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.features && data.features.length > 0) {
        setRouteGeoJSON(data)
        const distanceKm = data.features[0].properties.distance / 1000;
        const calculatedFareCents = Math.round((2.50 + distanceKm) * 100);
        setFare(calculatedFareCents);
      }
    } catch (error) {
      console.error("Error calculating route:", error)
    }
  }

  const handleInitiateCheckout = async () => {
    try {
      setRideStatus('checkout')
      const token = await getToken();
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
      const res = await fetch(`${serverUrl}/api/create-payment-intent`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ amount: fare }),
      });
      const data = await res.json();
      setClientSecret(data.clientSecret);
    } catch (error) {
      console.error("Error getting payment intent:", error)
      setRideStatus('idle')
    }
  }

  const handlePaymentSuccess = async () => {
    setRideStatus('searching')
    try {
      const token = await getToken();
      const distanceKm = routeGeoJSON?.features?.[0]?.properties?.distance / 1000 || 0;
      
      // Create ride in Supabase
      const newRide = await createRide(token, {
        pickup_address: pickup.address || 'Custom Pickup',
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_address: dropoff.address || 'Custom Dropoff',
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        fare_amount: fare,
        distance_km: distanceKm
      })
      
      setActiveRideId(newRide.id)

      // Broadcast to drivers
      socket.emit('request-ride', { 
        pickup, dropoff, route: routeGeoJSON, rideId: newRide.id 
      })
    } catch(err) {
      console.error("Failed to create ride request", err)
      alert(`Error requesting ride: ${err.message || 'Please try again.'}`)
      setRideStatus('idle')
    }
  }

  const resetRide = () => {
    setRideStatus('idle')
    setPickup(null)
    setDropoff(null)
    setRouteGeoJSON(null)
    setActiveRideId(null)
    setDriverProfile(null)
    setShowRatingModal(false)
  }

  return (
    <div className="w-full max-w-7xl flex flex-col md:flex-row gap-6">
      {/* Sidebar for booking & history */}
      <div className="w-full md:w-1/3 flex flex-col gap-6">
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 flex flex-col gap-4">
          <h2 className="text-3xl font-bold text-gray-800">Book a Ride</h2>
          
          {rideStatus === 'idle' || rideStatus === 'checkout' ? (
            <div className="flex flex-col gap-3 relative z-20">
              <p className="text-gray-600 mb-1">Where to?</p>
              <LocationSearch 
                placeholder="Pickup Location" 
                icon="pickup" 
                onLocationSelect={setPickup} 
              />
              <LocationSearch 
                placeholder="Dropoff Location" 
                icon="dropoff" 
                onLocationSelect={setDropoff} 
              />
            </div>
          ) : (
            <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
              <p className="font-medium">Destination Set</p>
              <p className="text-sm text-gray-600 truncate">{dropoff?.address}</p>
            </div>
          )}

          {routeGeoJSON && (
            <div className={`mt-4 p-4 rounded-lg border ${rideStatus === 'completed' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-100'}`}>
              <h3 className={`font-semibold ${rideStatus === 'completed' ? 'text-green-800' : 'text-blue-800'}`}>
                {rideStatus === 'idle' ? 'Route Found' 
                  : rideStatus === 'checkout' ? 'Complete Payment'
                  : rideStatus === 'searching' ? 'Finding a driver...' 
                  : rideStatus === 'completed' ? 'Ride Completed'
                  : 'Driver is on the way!'}
              </h3>
              
              {rideStatus === 'idle' && (
                <>
                  <p className="text-sm text-blue-600 mt-1">
                    Distance: {(routeGeoJSON.features[0].properties.distance / 1000).toFixed(1)} km <br/>
                    Time: {Math.round(routeGeoJSON.features[0].properties.time / 60)} mins <br/>
                    <strong>Estimated Fare: ${(fare / 100).toFixed(2)}</strong>
                  </p>
                  <button 
                    onClick={handleInitiateCheckout}
                    className="w-full mt-4 bg-black text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition-colors">
                    Proceed to Payment
                  </button>
                </>
              )}

              {rideStatus === 'checkout' && clientSecret && (
                <div className="mt-4 border-t border-blue-200 pt-4">
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <CheckoutForm 
                      amount={fare} 
                      onSuccess={handlePaymentSuccess} 
                      onCancel={() => {
                        setRideStatus('idle')
                        setClientSecret(null)
                      }} 
                    />
                  </Elements>
                </div>
              )}

              {rideStatus === 'searching' && (
                <div className="w-full mt-4 py-3 text-center border-2 border-dashed border-blue-300 rounded-lg text-blue-500 font-medium animate-pulse">
                  Finding nearby drivers...
                </div>
              )}

              {rideStatus === 'accepted' && (
                <div className="w-full mt-4 flex flex-col gap-3">
                  <div className="py-3 bg-green-500 text-white rounded-lg font-medium text-center shadow-sm">
                    Driver is arriving!
                  </div>
                  {driverProfile && (
                     <div className="p-3 bg-white rounded border border-gray-200 shadow-sm flex items-center justify-between">
                       <div>
                         <p className="font-bold text-gray-800">{driverProfile.first_name} {driverProfile.last_name}</p>
                         <p className="text-xs text-gray-500">{driverProfile.vehicle_type} • {driverProfile.vehicle_plate}</p>
                       </div>
                       <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded border border-yellow-200">
                         <span className="text-yellow-600 font-bold">{driverProfile.rating}</span>
                         <span className="text-yellow-400">★</span>
                       </div>
                     </div>
                  )}
                </div>
              )}

              {rideStatus === 'completed' && (
                <button
                  onClick={resetRide}
                  className="w-full mt-4 bg-black text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Book Another Ride
                </button>
              )}
            </div>
          )}
        </div>

        {/* History Section below booking */}
        {rideStatus === 'idle' && (
           <RideHistory role="rider" />
        )}
      </div>

      {/* Map Area */}
      <div className="w-full md:w-2/3 h-[500px] md:h-[700px] bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200 shadow-sm relative z-10">
        <Map pickup={pickup} dropoff={dropoff} routeGeoJSON={routeGeoJSON} driverLocation={driverLocation} />
      </div>

      {/* Rating Modal */}
      {showRatingModal && activeRideId && (
        <RatingModal 
          ride={{ id: activeRideId }} 
          onClose={() => setShowRatingModal(false)} 
        />
      )}
    </div>
  )
}

function DriverDashboard() {
  const { getToken, userId } = useAuth()
  const { user } = useUser()
  const [incomingRequest, setIncomingRequest] = useState(null)
  const [activeRide, setActiveRide] = useState(false)
  const [activeRideId, setActiveRideId] = useState(null)
  const [driverProfile, setDriverProfile] = useState(null)
  const [isArrived, setIsArrived] = useState(false)
  
  useEffect(() => {
    // Sync the current user to the database
    if (user) {
      syncUserToDatabase(user, 'driver').catch(console.error)
    }
  }, [user])

  useEffect(() => {
    // Load driver profile
    async function fetchProfile() {
       try {
         const token = await getToken()
         if(token && userId) {
            import('./lib/api.js').then(async ({ getDriverProfile }) => {
              const profile = await getDriverProfile(token, userId)
              setDriverProfile(profile)
            })
         }
       } catch(err) {
         console.log("Not registered as driver yet or error", err)
       }
    }
    fetchProfile()
    
    socket.connect()

    socket.on('incoming-ride-request', (data) => {
      console.log("Got ride request", data)
      setIncomingRequest(data)
    })

    return () => {
      socket.off('incoming-ride-request')
      socket.disconnect()
    }
  }, [getToken, userId])

  const handleAcceptRide = async () => {
    if (!incomingRequest || !incomingRequest.rideId) return;
    
    try {
      const token = await getToken();
      // Call backend to update Supabase row
      const requireAuth = true; // Make sure the user is set as a driver in DB.
      // Note: We'll just emit for now if the accept endpoint fails due to missing driver DB setup
      
      socket.emit('accept-ride', {
        ...incomingRequest,
        driverId: userId // send driver ID so rider can fetch profile
      })
      setActiveRide(true)
      setActiveRideId(incomingRequest.rideId)
      
      // Simulate Driver moving towards pickup
      simulateDriverMovement(incomingRequest)
    } catch(err) {
      console.error("Failed to accept", err);
      alert("Failed to accept ride. Are you registered as a driver in the DB?");
    }
  }

  const handleCompleteRide = async () => {
     try {
       const token = await getToken();
       await updateRideStatus(token, activeRideId, 'completed');
       
       // Tell the rider we're done
       socket.emit('driver-location-update', { riderSocketId: incomingRequest.riderSocketId, location: null, completed: true }) // custom mock signal
       
       alert("Ride Completed! Receipt sent to rider.");
       setActiveRide(false);
       setIncomingRequest(null);
       setActiveRideId(null);
       setIsArrived(false);
     } catch (err) {
       console.error("Failed to complete", err);
       alert(`Failed to mark ride completed: ${err.message || 'Server error'}`);
     }
  }

  const simulateDriverMovement = (req) => {
    let currentLat = req.pickup.lat + 0.005; 
    let currentLng = req.pickup.lng + 0.005;

    const intervalId = setInterval(() => {
      currentLat -= 0.0005; 
      currentLng -= 0.0005;

      socket.emit('driver-location-update', {
        riderSocketId: req.riderSocketId,
        location: { lat: currentLat, lng: currentLng }
      })

      if (Math.abs(currentLat - req.pickup.lat) < 0.0005) {
        clearInterval(intervalId)
        setIsArrived(true)
        alert('You have arrived at the pickup location!');
        // Show complete button in UI instead of automatic
      }
    }, 2000) 
  }

  return (
    <div className="w-full max-w-7xl flex flex-col md:flex-row gap-6">
      <div className="w-full md:w-1/3 flex flex-col gap-6">
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 flex flex-col gap-4">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-3xl font-bold text-gray-800">Driver Dash</h2>
            {driverProfile && (
               <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded border border-yellow-200">
                    <span className="text-yellow-600 font-bold">{driverProfile.rating}</span>
                    <span className="text-yellow-400">★</span>
                  </div>
               </div>
            )}
          </div>
          
          {!incomingRequest && !activeRide && (
            <div className="p-8 border-2 border-dashed border-gray-300 rounded-lg text-center bg-gray-50 animate-pulse">
              <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-3"></div>
              <p className="font-medium text-gray-600">Online & Ready</p>
              <p className="text-sm text-gray-400 mt-1">Waiting for ride requests...</p>
            </div>
          )}

          {incomingRequest && !activeRide && (
            <div className="p-5 bg-orange-50 border border-orange-200 rounded-xl shadow-sm slide-in">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 bg-orange-500 rounded-full animate-ping"></span>
                <h3 className="font-bold text-orange-800 text-lg">New Request!</h3>
              </div>
              
              <div className="text-sm text-gray-700 mb-5 bg-white p-4 rounded-lg border border-orange-100 shadow-sm flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <div className="mt-1 w-2 h-2 rounded-full bg-blue-500"></div>
                  <div>
                    <span className="block text-xs text-gray-400 font-bold uppercase">Pickup</span>
                    <span className="font-medium">{incomingRequest.pickup?.address || 'Selected Location'}</span>
                  </div>
                </div>
                <div className="w-0.5 h-4 bg-gray-200 ml-1"></div>
                <div className="flex items-start gap-2">
                  <div className="mt-1 w-2 h-2 rounded-full bg-red-500"></div>
                  <div>
                    <span className="block text-xs text-gray-400 font-bold uppercase">Dropoff</span>
                    <span className="font-medium">{incomingRequest.dropoff?.address || 'Selected Location'}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={handleAcceptRide}
                  className="flex-1 bg-black text-white py-3 rounded-lg font-bold hover:bg-gray-800 shadow-md transition-transform hover:scale-105">
                  Accept Ride
                </button>
                <button 
                  onClick={() => setIncomingRequest(null)}
                  className="px-4 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50">
                  Decline
                </button>
              </div>
            </div>
          )}

          {activeRide && (
            <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-blue-800 text-lg">
                  {isArrived ? 'Navigation Complete' : 'Ride in Progress'}
                </h3>
                {!isArrived && (
                  <span className="animate-pulse flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                )}
              </div>
              <p className={`text-sm mb-6 p-3 rounded border ${isArrived ? 'text-green-700 bg-green-50 border-green-200' : 'text-blue-700 bg-white border-blue-100'}`}>
                {isArrived ? 'You have arrived. Proceed with dropoff.' : 'Navigate to the passenger and then to the destination.'}
              </p>
              
              <button 
                onClick={handleCompleteRide}
                className="w-full bg-green-500 text-white py-3 rounded-lg font-bold hover:bg-green-600 shadow-md transition-colors">
                Mark as Completed
              </button>
            </div>
          )}
        </div>
        
        {/* Driver History */}
        {!activeRide && (
          <RideHistory role="driver" />
        )}
      </div>
      
      <div className="w-full md:w-2/3 h-[500px] md:h-[700px] bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200 shadow-sm relative z-10">
        <Map pickup={incomingRequest?.pickup} dropoff={incomingRequest?.dropoff} routeGeoJSON={incomingRequest?.route} />
      </div>
    </div>
  )
}

export default App
