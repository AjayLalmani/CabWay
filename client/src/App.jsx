import React, { useState, useEffect } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Map from './components/Map.jsx'
import LocationSearch from './components/LocationSearch.jsx'
import CheckoutForm from './components/CheckoutForm.jsx'
import { socket } from './lib/socket.js'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { SignedIn, SignedOut, SignIn, UserButton } from '@clerk/clerk-react'

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
  const [pickup, setPickup] = useState(null)
  const [dropoff, setDropoff] = useState(null)
  const [routeGeoJSON, setRouteGeoJSON] = useState(null)

  // Socket state
  const [rideStatus, setRideStatus] = useState('idle') // idle, checkout, searching, accepted
  const [driverLocation, setDriverLocation] = useState(null)
  
  // Payment state
  const [clientSecret, setClientSecret] = useState(null)
  const [fare, setFare] = useState(0) // dynamic mock fare in cents

  useEffect(() => {
    socket.connect()

    socket.on('ride-accepted', (data) => {
      setRideStatus('accepted')
      alert(data.message)
    })

    socket.on('driver-location-update', (data) => {
      setDriverLocation(data.location)
    })

    return () => {
      socket.off('ride-accepted')
      socket.off('driver-location-update')
      socket.disconnect()
    }
  }, [])

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
        // Mock fare: $2.50 base + $1 per km (converted to cents)
        const distanceKm = data.features[0].properties.distance / 1000;
        const calculatedFareCents = Math.round((2.50 + distanceKm) * 100);
        setFare(calculatedFareCents);
      }
    } catch (error) {
      console.error("Error calculating route:", error)
    }
  }

  const handleInitiateCheckout = async () => {
    // Before showing checkout form, fetch a payment intent
    try {
      setRideStatus('checkout')
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
      const res = await fetch(`${serverUrl}/api/create-payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: fare }),
      });
      const data = await res.json();
      setClientSecret(data.clientSecret);
    } catch (error) {
      console.error("Error getting payment intent:", error)
      setRideStatus('idle')
    }
  }

  const handlePaymentSuccess = () => {
    // Payment approved by Stripe, now broadcast to drivers!
    setRideStatus('searching')
    socket.emit('request-ride', { pickup, dropoff, route: routeGeoJSON })
  }

  return (
    <div className="w-full max-w-6xl flex flex-col md:flex-row gap-6">
      {/* Sidebar for booking */}
      <div className="w-full md:w-1/3 bg-white p-6 rounded-xl shadow-lg border border-gray-100 flex flex-col gap-4">
        <h2 className="text-3xl font-bold text-gray-800">Book a Ride</h2>
        <p className="text-gray-600 mb-2">Where to?</p>
        
        <div className="flex flex-col gap-3 relative z-20">
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

        {routeGeoJSON && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h3 className="font-semibold text-blue-800">
              {rideStatus === 'idle' ? 'Route Found' 
                : rideStatus === 'checkout' ? 'Complete Payment'
                : rideStatus === 'searching' ? 'Finding a driver...' 
                : 'Driver is on the way!'}
            </h3>
            <p className="text-sm text-blue-600 mt-1">
              Distance: {(routeGeoJSON.features[0].properties.distance / 1000).toFixed(1)} km <br/>
              Time: {Math.round(routeGeoJSON.features[0].properties.time / 60)} mins <br/>
              <strong>Estimated Fare: ${(fare / 100).toFixed(2)}</strong>
            </p>
            
            {rideStatus === 'idle' && (
              <button 
                onClick={handleInitiateCheckout}
                className="w-full mt-4 bg-black text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition-colors">
                Proceed to Payment
              </button>
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
              <div className="w-full mt-4 py-3 text-center border-2 border-dashed border-blue-300 rounded-lg text-blue-500 font-medium">
                Payment Success! Broadcasting to drivers...
              </div>
            )}
            {rideStatus === 'accepted' && (
              <div className="w-full mt-4 py-3 bg-green-500 text-white rounded-lg font-medium text-center shadow-sm">
                Ride Confirmed
              </div>
            )}
          </div>
        )}
      </div>

      {/* Map Area */}
      <div className="w-full md:w-2/3 h-[500px] md:h-[600px] bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200 shadow-sm relative z-10">
        <Map pickup={pickup} dropoff={dropoff} routeGeoJSON={routeGeoJSON} driverLocation={driverLocation} />
      </div>
    </div>
  )
}

function DriverDashboard() {
  const [incomingRequest, setIncomingRequest] = useState(null)
  const [activeRide, setActiveRide] = useState(false)
  
  useEffect(() => {
    socket.connect()

    socket.on('incoming-ride-request', (data) => {
      console.log("Got ride request", data)
      setIncomingRequest(data)
    })

    return () => {
      socket.off('incoming-ride-request')
      socket.disconnect()
    }
  }, [])

  const handleAcceptRide = () => {
    if (!incomingRequest) return;
    socket.emit('accept-ride', incomingRequest)
    setActiveRide(true)
    
    // Simulate Driver moving towards pickup
    simulateDriverMovement(incomingRequest)
  }

  const simulateDriverMovement = (req) => {
    // Very simple mock: Start near pickup, move slightly
    let currentLat = req.pickup.lat + 0.005; // start offset
    let currentLng = req.pickup.lng + 0.005;

    const intervalId = setInterval(() => {
      currentLat -= 0.0005; // move slightly towards the target
      currentLng -= 0.0005;

      socket.emit('driver-location-update', {
        riderSocketId: req.riderSocketId,
        location: { lat: currentLat, lng: currentLng }
      })

      // If we got super close, clear interval (mock arrival)
      if (Math.abs(currentLat - req.pickup.lat) < 0.0005) {
        clearInterval(intervalId)
        alert("Simulated Arrival at pickup!")
      }
    }, 2000) // Update every 2 seconds
  }

  return (
    <div className="w-full max-w-6xl flex flex-col md:flex-row gap-6">
      <div className="w-full md:w-1/3 bg-white p-6 rounded-xl shadow-lg border border-gray-100 flex flex-col gap-4">
        <h2 className="text-3xl font-bold text-gray-800">Driver Dashboard</h2>
        <p className="text-gray-600 mb-4">View incoming ride requests.</p>
        
        {!incomingRequest && !activeRide && (
          <div className="p-4 border border-dashed border-gray-300 rounded-lg text-center text-gray-500">
            Waiting for nearby passengers...
          </div>
        )}

        {incomingRequest && !activeRide && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg slide-in">
            <h3 className="font-bold text-orange-800 mb-2">New Ride Request!</h3>
            <div className="text-sm text-orange-900 mb-4 bg-white p-3 rounded border border-orange-100">
              <span className="block font-medium">Pickup:</span> {incomingRequest.pickup?.address || 'Selected Location'} <br/>
              <span className="block font-medium mt-2">Dropoff:</span> {incomingRequest.dropoff?.address || 'Selected Location'}
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleAcceptRide}
                className="flex-1 bg-green-500 text-white py-2 rounded font-medium hover:bg-green-600">
                Accept
              </button>
              <button 
                onClick={() => setIncomingRequest(null)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 rounded font-medium hover:bg-gray-300">
                Ignore
              </button>
            </div>
          </div>
        )}

        {activeRide && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-bold text-blue-800 mb-2">On the Way!</h3>
            <p className="text-sm text-blue-600">You are currently navigating to the passenger. Live location updates are being broadcasted via sockets.</p>
          </div>
        )}
      </div>
      
      <div className="w-full md:w-2/3 h-[500px] md:h-[600px] bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200 shadow-sm relative z-10">
        <Map pickup={incomingRequest?.pickup} dropoff={incomingRequest?.dropoff} routeGeoJSON={incomingRequest?.route} />
      </div>
    </div>
  )
}

export default App
