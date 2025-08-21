readcircle-backend/
├── controllers/                    # Handles actual logic
│   ├── authController.js
│   ├── bookController.js
│   ├── journalController.js
│   ├── habitController.js
│   ├── lendingController.js
│   └── marketplaceController.js    # Buy/Sell logic (seller & buyer actions)

├── models/                         # Mongoose schemas
│   ├── User.js                     # For login (admin1, admin2)
│   ├── Book.js                     # Bookshelf entries
│   ├── JournalEntry.js             # Daily logs
│   ├── Habit.js                    # Streaks & goals
│   ├── Lending.js                  # Lending/return system
│   └── Listing.js                  # For marketplace book selling

├── routes/                         # API routes
│   ├── authRoutes.js
│   ├── bookRoutes.js
│   ├── journalRoutes.js
│   ├── habitRoutes.js
│   ├── lendingRoutes.js
│   └── marketplaceRoutes.js

├── config/
│   └── db.js                       # MongoDB Atlas connection

├── middleware/
│   └── authMiddleware.js           # (Optional) Protect routes using token or session

├── utils/
│   └── email.js                    # (Optional) For sending notification emails to seller
│   └── timerCheck.js               # (Optional) 48-hour post expiration checker

├── .env                            # Environment config (MONGO_URI, PORT)
├── .gitignore                      # Ignore node_modules, .env, etc.
├── package.json                    # Express dependencies
├── README.md
└── server.js                       # Main server entry point
