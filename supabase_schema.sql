-- Create Users Table (Synced from Clerk)
CREATE TABLE public.users (
  id TEXT PRIMARY KEY, -- Clerk User ID
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT DEFAULT 'rider' CHECK (role IN ('rider', 'driver', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create Drivers Table
CREATE TABLE public.drivers (
  id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  license_number TEXT,
  vehicle_type TEXT, -- e.g., 'sedan', 'suv', 'bike'
  vehicle_plate TEXT,
  status TEXT DEFAULT 'offline' CHECK (status IN ('offline', 'online', 'in_ride')),
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  rating NUMERIC(3, 2) DEFAULT 5.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create Rides Table (Active Rides and Trip History)
CREATE TABLE public.rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id TEXT NOT NULL REFERENCES public.users(id),
  driver_id TEXT REFERENCES public.drivers(id),
  pickup_address TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  dropoff_address TEXT NOT NULL,
  dropoff_lat DOUBLE PRECISION NOT NULL,
  dropoff_lng DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'accepted', 'in_progress', 'completed', 'cancelled')),
  fare_amount NUMERIC(10, 2),
  distance_km NUMERIC(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = TIMEZONE('utc', NOW());
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for rides table
CREATE TRIGGER update_rides_modtime
BEFORE UPDATE ON public.rides
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
