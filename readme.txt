backend/
│
├── config/
│   ├── database.js          # Database configuration
│   ├── auth.js             # Authentication configuration
│   └── email.js            # Email service configuration
│
├── models/
│   ├── User.js             # User model
│   ├── Vendor.js           # Vendor model
│   ├── Contract.js         # Contract model
│   ├── PurchaseOrder.js    # Purchase order model
│   ├── Budget.js           # Budget model
│   ├── Performance.js      # Vendor performance model
│   └── Department.js       # Department model
│
├── controllers/
│   ├── authController.js   # Authentication logic  h
│   ├── vendorController.js # Vendor management   h
│   ├── contractController.js# Contract management  h
│   ├── poController.js     # Purchase order management
│   ├── budgetController.js # Budget management
│   └── performanceController.js # Performance evaluation
│
├── routes/
│   ├── auth.js             # Authentication routes
│   ├── vendor.js           # Vendor routes
│   ├── contract.js         # Contract routes
│   ├── purchaseOrder.js    # Purchase order routes
│   ├── budget.js           # Budget routes
│   └── performance.js      # Performance routes
│
├── middleware/
│   ├── auth.js             # Authentication middleware
│   ├── roleCheck.js        # Role-based access control
│   ├── validation.js       # Input validation
│   └── errorHandler.js     # Error handling middleware
│
├── utils/
│   ├── database.js         # Database utility functions
│   ├── email.js            # Email notification utilities
│   ├── validation.js       # Validation helpers
│   └── logger.js           # Logging utility
│
├── procedures/
│   ├── vendorRegistration.sql    # Vendor registration procedure
│   ├── contractRenewal.sql       # Contract renewal procedure
│   └── performanceEval.sql       # Performance evaluation procedure
│
├── triggers/
│   ├── contractRenewalAlert.sql  # Contract renewal notifications
│   └── budgetCheck.sql           # Budget limit checks
│
├── .env                    # Environment variables
├── package.json           # Project dependencies
├── server.js             # Entry point
└── README.md             # Project documentation