# EventEase

EventEase is a comprehensive event booking platform designed to make it easy for users to browse, explore, and book different types of events. Built with React, Node.js, and MongoDB, the platform provides a seamless experience with a visually appealing design powered by Bootstrap.

Built as a team project for INFO 6150 (Web Design & UX Engineering) at Northeastern University. This is my fork of our team repo; the original lives at [pavan-neu/INFO6150_FinalProject](https://github.com/pavan-neu/INFO6150_FinalProject).

## My Contributions (Aravind Sundaravadivelu)

I owned the backend:

- Designed and built the REST APIs for events, tickets, transactions, and users (Node.js, Express, MongoDB/Mongoose)
- JWT authentication and role-based access control across the User, Organizer, and Admin roles
- Stripe payment integration (Payment Intents) with webhook-based payment confirmation
- Ticket reservation system: 10-minute holds with a cron sweeper that releases expired reservations, preventing double-selling during checkout
- Request validation, pagination, and unique-index-backed integrity constraints
- AWS deployment (EC2 for the API, S3) with MongoDB Atlas

<!-- TODO: add 2-3 screenshots here (event browse, checkout, organizer dashboard) -->

## Features

- **User Authentication**: Complete JWT-based authentication system with role-based access (User, Organizer, Admin)
- **Event Discovery**: Browse events with advanced filtering, searching, and sorting capabilities
- **Ticket Booking**: Book tickets with 10-minute reservation holds and secure Stripe payment processing
- **User Dashboard**: Manage profile, view booked tickets, and transaction history
- **Organizer Dashboard**: Create and manage events, track ticket sales, and monitor attendance
- **Admin Panel**: Manage users, and oversee platform operations
- **Responsive Design**: Mobile-first approach for optimal experience across all devices

## Tech Stack

### Frontend

- React 18
- Bootstrap 5
- React Router v6
- Axios for API communication
- Context API for state management

### Backend

- Node.js
- Express.js
- MongoDB with Mongoose
- JWT for authentication
- Stripe (Payment Intents + webhooks)
- node-cron for scheduled reservation cleanup
- Bcrypt for password encryption
- Multer for file uploads

## Project Structure

```
├── README.md
├── backend/                # Express API
│   ├── config/             # DB connection
│   ├── controllers/        # events, tickets, payments, transactions, users
│   ├── crons/              # ticket reservation expiry sweeper
│   ├── middlewares/        # auth (JWT), uploads (Multer)
│   ├── models/             # Mongoose schemas
│   ├── routes/
│   └── server.js
└── event-ease/             # React app (Create React App)
    └── src/
        ├── components/
        ├── context/
        ├── hooks/
        ├── pages/
        ├── services/
        └── utils/
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MongoDB (local or Atlas)
- A Stripe account (test keys work fine)

### Frontend Setup

1. Clone the repository

```bash
git clone https://github.com/AravindKumar2504/EventEase.git
cd EventEase/event-ease
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables. Create a `.env` file in `event-ease/` and add:

```
REACT_APP_API_URL=http://localhost:5001/api
```

4. Start the development server

```bash
npm start
```

5. The application will be running at `http://localhost:3000`

### Backend Setup

1. Navigate to the backend directory

```bash
cd backend
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables. Create a `.env` file and add:

```
PORT=5001
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_signing_secret
NODE_ENV=development
```

4. Start the backend server

```bash
npm run dev
```

5. The API will be running at `http://localhost:5001/api`

## User Roles and Flows

### User

- Register/Login
- Browse and search events
- Book tickets for events (10-minute reservation window)
- Make payments
- View tickets and transaction history
- Update profile information

### Organizer

- Create and manage events
- Upload event images
- Track ticket sales and attendance
- View event statistics
- Manage event details

### Admin

- Manage all users (view, edit, suspend)
- Moderate events (approve, feature, hide)
- View platform-wide statistics
- Manage transactions and refunds

## API Endpoints

- `/api/users` - User management
- `/api/events` - Event management (pagination and sorting via query params)
- `/api/tickets` - Ticket booking with 10-minute reservation holds and automatic expiry release
- `/api/payments` - Stripe Payment Intents, confirmation, and signature-verified webhook
- `/api/transactions` - Payment history

Note on the Stripe webhook: `/api/payments/webhook` is mounted with the raw request body (before JSON parsing) because Stripe signs the exact bytes of the payload; parsing and re-serializing the body breaks signature verification.

## Deployment

The production deployment runs on AWS with MongoDB Atlas:

- **Backend**: Node/Express API on an EC2 instance
- **Frontend**: production build (`npm run build`) served from S3
- **Database**: MongoDB Atlas

To deploy your own instance: build the frontend with `npm run build` and host the `build` folder on any static host, run the backend on any Node hosting service, and supply the environment variables listed above (point `REACT_APP_API_URL` at your deployed API before building).

## Future Enhancements

- Event recommendations based on user preferences
- Social sharing functionality
- Event reminders and notifications
- Reviews and ratings for events
- Recurring events support
- QR code ticket scanning

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [React](https://reactjs.org/)
- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [MongoDB](https://www.mongodb.com/)
- [Stripe](https://stripe.com/)
- [Bootstrap](https://getbootstrap.com/)
- [React Router](https://reactrouter.com/)
