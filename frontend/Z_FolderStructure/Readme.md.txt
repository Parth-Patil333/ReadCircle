readcircle-frontend/
├── index.html                      # Frontpage
├── login.html                      # Login page
├── dashboard.html                  # Main options page (Option 1, 2, 3)

├── bookshelf/                      # Option 1: Personal Reading
│   ├── add-book.html
│   ├── journal.html
│   ├── tracker.html
│   └── export.html

├── lending/                        # Option 2: Lending Tracker
│   ├── inventory.html
│   ├── lend.html
│   ├── due-tracker.html
│   └── notifications.html

├── marketplace/                    # Option 3: Buy/Sell Books
│   ├── sell-buy.html               # Common entry page for buyer/seller
│   ├── seller-dashboard.html
│   ├── buyer-dashboard.html

├── js/                             # All JS logic
│   ├── auth.js                     # Login + session logic
│   ├── books.js                    # Add/view books
│   ├── journal.js                  # Journal entries
│   ├── tracker.js                  # Reading habit streaks/goals
│   ├── export.js                   # Export logs to PDF
│   ├── inventory.js                # Lending logic
│   ├── lending.js                  # Lending and return functions
│   ├── notifications.js           # Due date alerts
│   ├── seller.js                   # Seller side logic
│   ├── buyer.js                    # Buyer side logic
│   └── listing-timer.js            # 48-hour logic for confirmations

├── css/
│   └── styles.css                  # Common styling for all pages

├── assets/
│   ├── images/                     # Book covers, icons
│   └── logos/

├── .gitignore                      # node_modules, .env, etc.
├── README.md
└── package.json (optional)         # Only if using npm tools
