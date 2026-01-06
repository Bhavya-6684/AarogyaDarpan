# Aarogya Darpan - Healthcare Platform

A comprehensive healthcare website with Patient and Hospital portals, built using HTML, CSS, Vanilla JavaScript (frontend) and Node.js + Express (backend).

## Features

### Patient Portal
- **Authentication**: Signup with phone number + OTP verification, secure login
- **Dashboard**: Overview of reminders, prescriptions, reports, and notifications
- **Smart Medicine Reminders**: Automatic reminders based on prescriptions (SMS + in-app)
- **Prescriptions**: View all prescriptions from hospitals
- **Medical Reports**: View and download medical reports
- **Family Members**: Add and manage multiple family member profiles
- **Profile Management**: Update profile, upload photo, change password
- **AI Chatbot**: Get answers to medicine-related questions

### Hospital/Doctor Portal
- **Authentication**: Email + password login/signup
- **Create Prescriptions**: Generate prescriptions for patients
- **Upload Reports**: Upload medical reports for patients
- **Admitted Patients**: Manage admitted patients with automatic access
- **Patient Info Access**: Request consent-based access to patient information
- **Dashboard**: Overview of recent activities

## Tech Stack

### Frontend
- HTML5 (semantic, accessible)
- CSS3 (Flexbox, Grid, animations)
- Vanilla JavaScript (DOM, Fetch API)

### Backend
- Node.js
- Express.js
- MongoDB (with Mongoose)
- JWT Authentication
- bcryptjs (password hashing)

### Security & Features
- JWT-based authentication
- OTP verification (SMS via Twilio)
- Rate limiting
- Input validation
- Secure headers (Helmet)
- Encrypted sensitive data

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or MongoDB Atlas)
- Twilio account (for SMS) - Optional for development

### Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd AarogyaDarpan2
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/aarogyadarpan
   JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
   JWT_EXPIRE=7d
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_phone_number
   NODE_ENV=development
   ```

4. **Start MongoDB**
   Make sure MongoDB is running on your system. If using MongoDB Atlas, update the `MONGODB_URI` in `.env`.

5. **Run the application**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Open your browser and navigate to `http://localhost:3000`
   - Patient Portal: `http://localhost:3000/patient`
   - Hospital Portal: `http://localhost:3000/hospital`

## Project Structure

```
AarogyaDarpan2/
├── models/              # MongoDB models
│   ├── User.js
│   ├── FamilyMember.js
│   ├── Prescription.js
│   ├── MedicalReport.js
│   ├── MedicineReminder.js
│   ├── Notification.js
│   ├── Consent.js
│   └── Admission.js
├── routes/              # Express routes
│   ├── auth.js
│   ├── patient.js
│   ├── hospital.js
│   ├── reminders.js
│   └── chatbot.js
├── middleware/          # Express middleware
│   ├── auth.js
│   └── upload.js
├── utils/               # Utility functions
│   ├── generateOTP.js
│   ├── sendSMS.js
│   └── reminderScheduler.js
├── public/              # Frontend files
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── auth.js
│   │   ├── patient-dashboard.js
│   │   └── hospital-dashboard.js
│   ├── patient/
│   │   ├── login.html
│   │   ├── signup.html
│   │   ├── dashboard.html
│   │   ├── profile.html
│   │   └── forgot-password.html
│   ├── hospital/
│   │   ├── login.html
│   │   ├── signup.html
│   │   └── dashboard.html
│   └── index.html
├── uploads/             # Uploaded files (created automatically)
│   ├── profiles/
│   └── reports/
├── server.js            # Express server
├── package.json
└── README.md
```

## Usage

### Patient Portal

1. **Signup**: Register with phone number, verify OTP
2. **Login**: Login with phone number and password
3. **Dashboard**: View reminders, prescriptions, reports
4. **Add Family Members**: Add family members to manage their health records
5. **View Prescriptions**: All prescriptions from hospitals appear automatically
6. **Medicine Reminders**: Automatic reminders based on prescription timings
7. **Medical Reports**: View and download reports
8. **AI Chatbot**: Ask questions about medicines

### Hospital Portal

1. **Signup/Login**: Register or login with email and password
2. **Create Prescription**: Create prescriptions for patients using phone number
3. **Upload Reports**: Upload medical reports for patients
4. **Admit Patients**: Admit patients (automatic access granted)
5. **Request Access**: Request consent-based access to patient information
6. **View Patient Info**: View patient data after consent or admission

## Smart Medicine Reminder System

- Automatically parses prescription data
- Extracts medicine name, timing, and duration
- Creates reminders for each medicine timing
- Sends SMS reminders (if Twilio configured)
- In-app notifications
- Auto-stops after completion

## Security Features

- JWT token-based authentication
- Password hashing with bcrypt
- Rate limiting on API routes
- Input validation and sanitization
- Secure headers (Helmet)
- Consent-based data access
- Automatic access revocation after discharge

## SMS Configuration (Optional)

For production, configure Twilio in `.env`:
- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number

In development, SMS messages are logged to console.

## API Endpoints

### Authentication
- `POST /api/auth/patient/signup` - Patient signup
- `POST /api/auth/patient/verify-otp` - Verify OTP
- `POST /api/auth/patient/login` - Patient login
- `POST /api/auth/hospital/signup` - Hospital signup
- `POST /api/auth/hospital/login` - Hospital login
- `POST /api/auth/patient/forgot-password` - Request password reset
- `POST /api/auth/patient/reset-password` - Reset password

### Patient Routes
- `GET /api/patient/dashboard` - Get dashboard data
- `GET /api/patient/prescriptions` - Get prescriptions
- `GET /api/patient/reports` - Get medical reports
- `GET /api/patient/reports/:id/download` - Download report
- `GET /api/patient/reminders` - Get reminders
- `GET /api/patient/family-members` - Get family members
- `POST /api/patient/family-members` - Add family member
- `PUT /api/patient/profile` - Update profile
- `POST /api/patient/profile/photo` - Upload profile photo
- `PUT /api/patient/change-password` - Change password

### Hospital Routes
- `GET /api/hospital/dashboard` - Get dashboard data
- `POST /api/hospital/prescriptions` - Create prescription
- `POST /api/hospital/reports` - Upload report
- `GET /api/hospital/admissions` - Get admissions
- `POST /api/hospital/admissions` - Admit patient
- `PUT /api/hospital/admissions/:id/discharge` - Discharge patient
- `POST /api/hospital/consent/request` - Request consent
- `GET /api/hospital/patient-info/:id` - Get patient info

### Other Routes
- `POST /api/chatbot/chat` - Chatbot endpoint
- `PUT /api/reminders/:id/complete` - Complete reminder
- `PUT /api/reminders/:id/toggle` - Toggle reminder

## Notes

- All API requests (except auth) require JWT token in Authorization header
- File uploads are stored in `uploads/` directory
- MongoDB connection string can be local or MongoDB Atlas
- For production, change JWT_SECRET and use environment variables
- SMS functionality requires Twilio account (optional for development)

## License

ISC

## Support

For issues and questions, please open an issue in the repository.

