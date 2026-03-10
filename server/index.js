import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { clerkMiddleware, requireAuth } from '@clerk/express'
import { createServer } from 'http' // Add standard http module to wrap express
import { Server } from 'socket.io' // Import socket.io
import Stripe from 'stripe'

// Load environment variables
dotenv.config()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder')

const app = express()
// Create HTTP server wrapping our Express app
const httpServer = createServer(app)

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL,
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    // If the origin is our explicit client URL or localhost, allow it
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    // Alternatively, dynamically allow ANY vercel.app subdomain for PR previews
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

// Initialize Socket.io server
const io = new Server(httpServer, {
  cors: corsOptions
})

// Express Middleware
app.use(cors(corsOptions))
app.use(express.json())
app.use(clerkMiddleware())

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CabWay Server is running' })
})

// Protected route example
app.get('/api/protected', requireAuth(), (req, res) => {
  res.json({ 
    message: 'This is a protected route', 
    userId: req.auth.userId 
  })
})

// Create Payment Intent endpoint
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body;
    
    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // amount in cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Stripe error:", error)
    res.status(500).json({ error: error.message });
  }
})

// ----- Socket.io Logic -----
io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // When a user wants to broadcast a ride to available drivers
  socket.on('request-ride', (rideData) => {
    console.log("Ride requested: ", rideData)
    // Broadcast the ride request to all connected clients (specifically drivers waiting)
    // Normally we would broadcast only to a 'drivers' room or nearby drivers.
    socket.broadcast.emit('incoming-ride-request', { ...rideData, riderSocketId: socket.id });
  });

  // When a driver accepts a ride
  socket.on('accept-ride', (data) => {
    console.log("Ride accepted: ", data)
    // Notify the specific rider that their ride was accepted
    io.to(data.riderSocketId).emit('ride-accepted', { driverSocketId: socket.id, message: "Driver is on the way!" });
  });

  // Driver sending live location updates
  socket.on('driver-location-update', (data) => {
    // Forward the location to the specific rider
    io.to(data.riderSocketId).emit('driver-location-update', data);
  });

  socket.on('disconnect', () => {
    console.log(`User Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000

// Important: Listen on httpServer, not the bare express app
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
