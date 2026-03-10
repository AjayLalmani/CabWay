-- Create Reviews Table
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES public.rides(id) UNIQUE, -- One review per ride
  rider_id TEXT NOT NULL REFERENCES public.users(id),
  driver_id TEXT NOT NULL REFERENCES public.drivers(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Function to update the driver's average rating
CREATE OR REPLACE FUNCTION update_driver_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.drivers
  SET rating = (
    SELECT ROUND(AVG(rating)::numeric, 2)
    FROM public.reviews
    WHERE driver_id = NEW.driver_id
  )
  WHERE id = NEW.driver_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to fire the rating update whenever a new review is added
CREATE TRIGGER review_added
AFTER INSERT OR UPDATE ON public.reviews
FOR EACH ROW
EXECUTE PROCEDURE update_driver_rating();
