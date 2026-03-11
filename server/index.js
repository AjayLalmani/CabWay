import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Stripe from 'stripe'
import { supabase } from './lib/supabase.js'
import { Resend } from 'resend'
import { render } from '@react-email/render'
import ReceiptEmail from './emails/ReceiptEmail.jsx'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { clerkMiddleware, requireAuth } from '@clerk/express'
import React from 'react'

// Load environment variables
dotenv.config()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder')
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder')

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
app.post('/api/create-payment-intent', requireAuth(), async (req, res) => {
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

// ----- Supabase Integration Endpoints -----

// Sync Clerk User to Supabase (Called from Frontend upon sign in/up)
app.post('/api/users/sync', async (req, res) => {
  try {
    const { id, email, first_name, last_name, role } = req.body;
    const { data, error } = await supabase
      .from('users')
      .upsert({ id, email, first_name, last_name, role: role || 'rider' })
      .select();
      
    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    console.error("User Sync Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create a new ride request
app.post('/api/rides', requireAuth(), async (req, res) => {
  try {
    const rider_id = req.auth.userId;
    const { pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, fare_amount, distance_km } = req.body;
    
    const { data, error } = await supabase
      .from('rides')
      .insert([{
        rider_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, fare_amount, distance_km, status: 'requested'
      }])
      .select();
      
    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Driver accepts a ride
app.put('/api/rides/:id/accept', requireAuth(), async (req, res) => {
  try {
    const driver_id = req.auth.userId;
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('rides')
      .update({ driver_id, status: 'accepted' })
      .eq('id', id)
      .eq('status', 'requested')
      .select();
      
    if (error) throw error;
    if (data.length === 0) return res.status(400).json({ error: 'Ride no longer available or not requested' });
    
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Ride Status (e.g., in_progress, completed, cancelled)
app.put('/api/rides/:id/status', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // 1. Update the ride
    const { data: rideData, error: rideError } = await supabase
      .from('rides')
      .update({ status })
      .eq('id', id)
      .select(`
        *,
        users!rides_rider_id_fkey (
          email,
          first_name
        )
      `);
      
    if (rideError) throw rideError;
    const ride = rideData[0];

    // 2. If completed, send the email receipt
    if (status === 'completed' && ride) {
      const riderEmail = ride.users?.email;
      if (riderEmail && process.env.RESEND_API_KEY) {
        try {
          const emailHtml = await render(React.createElement(ReceiptEmail, { ride }));
          await resend.emails.send({
            from: 'CabWay <receipts@cabway.com>', // requires a verified domain in production
            to: riderEmail,
            subject: `Your receipt for ride ${id.split('-')[0]}`,
            html: emailHtml,
          });
          console.log(`Receipt sent to ${riderEmail}`);
        } catch (emailErr) {
          console.error("Failed to send receipt email:", emailErr);
          // Don't throw; we still want to return success for the status update
        }
      }
    }
    
    res.json(ride);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit a Rating and Review for a Ride
app.post('/api/rides/:id/rating', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const rider_id = req.auth.userId;

    // 1. Fetch the ride to get driver_id and ensure it's completed
    const { data: rideData, error: fetchError } = await supabase
      .from('rides')
      .select('driver_id, status, rider_id')
      .eq('id', id)
      .single();

    if (fetchError || !rideData) throw new Error('Ride not found');
    if (rideData.status !== 'completed') throw new Error('Can only rate completed rides');
    if (rideData.rider_id !== rider_id) throw new Error('Unauthorized');
    if (!rideData.driver_id) return res.status(400).json({ error: 'Cannot review a ride without a driver' });

    // 2. Insert Review (Supabase Trigger handles the average rating update)
    const { data, error } = await supabase
      .from('reviews')
      .insert([{
        ride_id: id,
        rider_id,
        driver_id: rideData.driver_id,
        rating,
        comment
      }])
      .select();

    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Ride already reviewed' });
      throw error;
    }

    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Driver Profile & Average Rating
app.get('/api/drivers/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('drivers')
      .select(`
        *,
        users!inner(first_name, last_name, email)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json({
      id: data.id,
      rating: data.rating,
      first_name: data.users.first_name,
      last_name: data.users.last_name,
      vehicle_type: data.vehicle_type,
      vehicle_plate: data.vehicle_plate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Trip History for the current user
app.get('/api/rides/history', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const role = req.query.role || 'rider'; // 'rider' or 'driver'
    
    const column = role === 'driver' ? 'driver_id' : 'rider_id';
    
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq(column, userId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

  // Driver sending live location updates or completed signal
  socket.on('driver-location-update', (data) => {
    if (data.completed) {
      io.to(data.riderSocketId).emit('ride-completed');
    } else {
      io.to(data.riderSocketId).emit('driver-location-update', data);
    }
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
