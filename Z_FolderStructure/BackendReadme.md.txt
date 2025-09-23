readcircle-backend/

├── config/
│   └── db.js                       # MongoDB Atlas connection

├── controllers/                    # Handles actual logic
│   ├── authController.js
│   ├── bookController.js
│   ├── booklistingController.js
│   ├── dashboardController.js
│   ├── habitController.js
│   ├── journalController.js
│   ├── notificationController.js
│   ├── profileController.js
│   ├── lendingController.js
│   └── userController.js

├── cron/                         
│   ├── cleanup.js

├── jobs/                         
│   ├── duedateChecker.js

├── middleware/
│   └── authMiddleware.js           # (Optional) Protect routes using token or session

├── models/                         # Mongoose schemas
│   ├── BookListing.js
│   ├── Book.js                     # Bookshelf entries
│   ├── Habit.js                    # Streaks & goals
│   ├── JournalEntry.js             # Daily logs
│   ├── Lending.js                  # Lending/return system
│   ├── Notification.js
│   ├── test.js
│   ├── User.js                     # For login (admin1, admin2)

├── node_modules/ 

├── routes/                         # API routes
│   ├── authRoutes.js
│   ├── booklisting.js
│   ├── bookRoutes.js
│   ├── dashboardRoutes.js
│   ├── habitRoutes.js
│   ├── journalRoutes.js
│   ├── lendingRoutes.js
│   ├── notificationRoutes.js
│   ├── profileRoutes.js
│   ├── testRoutes.js
│   └── userRoutes.js



├── utils/
│   ├── notify.js

├── .env                            # Environment config (MONGO_URI, PORT)
├── .gitignore                      # Ignore node_modules, .env, etc.
├── package.json                    # Express dependencies
├── README.md
└── server.js                       # Main server entry point
