# CabWay

Welcome to CabWay, a complete Uber-clone ride-booking application featuring real-time driver tracking, secure authentication, seamless payment processing, and interactive map booking.

## Features
- **User Authentication**: Secure signup and login for riders and drivers using Clerk.
- **Interactive Maps**: Real-time vehicle tracking, location search, and map routing integrated using Google Maps API.
- **Payment Processing**: Integrated Stripe checkout for smooth and secure rides.
- **Database Architecture**: Robust Supabase schema structured for users, drivers, rides, and history.
- **Real-Time Updates**: Instantly handles driver status and location to ensure seamless tracking.

## Technology Stack
- **Frontend**: React, Next.js, and Tailwind CSS for mobile-first user interfaces.
- **Backend / DB**: Node.js backend handling rides, with Supabase.
- **Third Party**: Stripe (Payments), Clerk (Auth), and Google Maps.

## Setup Instructions
1. Clone the repository.
2. Install dependencies for both client and server:
   ```sh
   cd client && npm install
   cd ../server && npm install
   ```
3. Set up your `.env` and `.env.local` files using the respective configurations (they are deliberately ignored in Git for security).
4. Run the development server:
   ```sh
   cd client && npm run dev
   ```
