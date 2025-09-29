# 🎥 HangO - Modern Video Meeting Platform

**HangO** is a feature-rich, real-time video conferencing platform that enables seamless audio/video calls, screen sharing, and collaborative meetings with an intuitive user interface.

## ✨ Features

### 🔐 **Authentication System**
- **Multiple Login Options**: Email/Password, GitHub OAuth, Google OAuth
- **Account Management**: User registration with email verification
- **Profile Management**: Avatar upload, username editing, phone number support
- **Session Management**: Persistent login sessions across browser restarts
- **Password Recovery**: Secure password reset via email

### 🎥 **Video Conferencing**
- **Real-time WebRTC**: Peer-to-peer video and audio communication
- **Screen Sharing**: Share your entire screen or specific applications
- **Meeting Controls**: Mute/unmute audio, enable/disable video, toggle screen share
- **Multi-participant Support**: Join meetings with multiple users simultaneously
- **Responsive UI**: Works seamlessly on desktop and mobile devices

### 💬 **Communication Features**
- **Live Chat**: Real-time messaging during meetings
- **Chat History**: Persistent message history for each meeting
- **User Presence**: See who's online and their media status
- **Meeting Notifications**: Audio/visual notifications for participant actions

### 🏢 **Meeting Management**
- **Easy Meeting Creation**: Generate unique meeting codes instantly
- **Pre-meeting Lobby**: Join meetings with device testing capabilities
- **Meeting Analytics**: Track meeting duration, participants, and engagement
- **Meeting History**: View past meetings and statistics in dashboard

### 🎨 **User Experience**
- **Modern UI**: Clean, gradient-based design with smooth animations
- **Dark Theme**: Eye-friendly dark interface with neon accents
- **Responsive Design**: Optimized for all screen sizes and devices
- **Interactive Elements**: Hover effects, smooth transitions, and intuitive controls
- **Accessibility**: Keyboard navigation and screen reader support

## 🛠️ Technology Stack

### **Backend**
- **Node.js** - Runtime environment
- **Express.js** - Web application framework
- **Socket.IO** - Real-time bidirectional communication
- **Passport.js** - Authentication middleware
- **bcrypt** - Password hashing and security

### **Frontend**
- **WebRTC** - Peer-to-peer communication
- **Vanilla JavaScript** - Core functionality
- **CSS3** - Modern styling with gradients and animations
- **HTML5** - Semantic markup

### **Database & Services**
- **Airtable** - Cloud database for user and meeting data
- **Nodemailer** - Email service for verification and notifications
- **UUID** - Unique identifier generation

### **Authentication Providers**
- **GitHub OAuth** - GitHub account integration
- **Google OAuth** - Google account integration
- **Email/Password** - Traditional authentication

## 📋 Prerequisites

Before running HangO, ensure you have:

- **Node.js** (v14 or higher)
- **npm** or **yarn** package manager
- **Airtable Account** (for database)
- **Email Service** (Gmail, SendGrid, etc.)
- **OAuth Apps** (GitHub and/or Google - optional)

## 🚀 Installation & Setup

### 1. **Clone Repository**
```bash
git clone https://github.com/your-username/hango.git
cd hango
```

### 2. **Install Dependencies**
```bash
npm install
```

### 3. **Environment Configuration**
Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
SESSION_SECRET=your-super-secret-session-key

# Airtable Configuration
AIRTABLE_API_KEY=your-airtable-api-key
AIRTABLE_BASE_ID=your-airtable-base-id

# Email Configuration 
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Google Calender Auth
GOOGLE_CALENDAR_CLIENT_ID=your_calendar_client_id_here
GOOGLE_CALENDAR_CLIENT_SECRET=your_calendar_client_secret_here
```

### 4. **Airtable Setup**
Create an Airtable base with a **Users** table containing these fields:
- `full_name` (Single line text)
- `username` (Single line text)
- `email` (Email)
- `phone` (Phone number)
- `password_hash` (Single line text)
- `is_verified` (Checkbox)
- `verification_token` (Single line text)
- `reset_token` (Single line text)
- `reset_token_expires` (Date)
- `provider` (Single line text)
- `provider_id` (Single line text)
- `avatar_url` (URL)
- `created_at` (Date)
- `updated_at` (Date)

Create a **Meetings** table with:
- `meeting_code` (Single line text)
- `title` (Single line text)
- `host_id` (Single line text)
- `participants` (Long text)
- `chat_history` (Long text)
- `created_at` (Date)
- `last_activity` (Date)
- `status` (Single select: Active, Ended)

### 5. **OAuth Setup (Optional)**

#### **GitHub OAuth:**
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create new OAuth App with callback: `http://localhost:3000/auth/github/callback`
3. Add client ID and secret to `.env`

#### **Google OAuth:**
1. Go to Google Cloud Console > APIs & Services > Credentials
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
4. Add client ID and secret to `.env`

## 🎯 Usage

### **Starting the Application**
```bash

npm run dev

npm start
```

### **Accessing HangO**
- Open browser to `http://localhost:3000`
- Create an account or login with existing credentials
- Navigate to dashboard to create or join meetings

### **Creating a Meeting**
1. Login to your account
2. Go to Dashboard
3. Click "Start Meeting" to create a new meeting
4. Share the meeting code with participants
5. Enjoy your video conference!

### **Joining a Meeting**
1. Click "Join Meeting" on homepage or dashboard
2. Enter the meeting code provided by the host
3. Test your camera and microphone in the pre-meeting lobby
4. Click "Join Now" to enter the meeting

## 📁 Project Structure

```
hango/
├── server.js                 # Main server file
├── package.json             # Dependencies and scripts
├── .env                     # Environment variables
├── public/                  # Static frontend files
│   ├── index.html          # Homepage
│   ├── auth.html           # Authentication page
│   ├── dashboard.html      # User dashboard
│   ├── premeeting.html     # Pre-meeting lobby
│   ├── meet-webrtc.html    # Main meeting interface
│   ├── styles.css          # Main stylesheet
│   └── app.js              # Frontend JavaScript
├── routes/                 # Express routes
│   └── auth.js             # Authentication routes
├── services/               # Backend services
│   ├── AirtableService.js  # Database operations
│   ├── EmailService.js     # Email functionality
│   └── MeetingService.js   # Meeting management
└── README.md              # This file
```

## 🔧 API Endpoints

### **Authentication**
- `POST /api/user/register` - User registration
- `POST /api/user/login` - User login
- `GET /api/user/session` - Get current session
- `POST /api/user/logout` - User logout
- `POST /api/user/update-profile` - Update user profile
- `GET /api/user/verify` - Email verification
- `POST /api/user/forgot-password` - Password reset request
- `POST /api/user/reset-password` - Password reset

### **OAuth**
- `GET /auth/github` - GitHub OAuth login
- `GET /auth/github/callback` - GitHub OAuth callback
- `GET /auth/google` - Google OAuth login
- `GET /auth/google/callback` - Google OAuth callback

### **Meetings**
- `POST /api/meeting/create` - Create new meeting
- `GET /api/meeting/:code` - Get meeting details
- `POST /api/meeting/join` - Join existing meeting

## 🎨 Customization

### **Styling**
- Edit `public/styles.css` for visual customization
- Modify CSS variables for color scheme changes
- Update animations and transitions in the stylesheet

### **Features**
- Add new routes in `routes/` directory
- Extend database schema in `services/AirtableService.js`
- Implement additional OAuth providers in `routes/auth.js`

## 🔒 Security Features

- **Password Security**: bcrypt hashing with 12 salt rounds
- **Session Management**: Secure session cookies with configurable expiration
- **Input Validation**: Comprehensive validation on both frontend and backend
- **CORS Protection**: Configured CORS policies for API security
- **Environment Variables**: Sensitive data stored in environment variables
- **OAuth Security**: Secure OAuth implementation with provider validation

## 🚀 Deployment

### **Production Environment Variables**
```env
NODE_ENV=production
SESSION_SECRET=super-secure-production-secret
```

### **Deployment Platforms**
- **Heroku**: Add buildpack and configure environment variables
- **Vercel**: Use serverless functions for API routes
- **DigitalOcean**: Deploy on droplet with PM2 for process management

## 🐛 Troubleshooting

### **Common Issues**
1. **WebRTC Connection Fails**: Check firewall settings and STUN/TURN server configuration
2. **Database Connection Error**: Verify Airtable API key and base ID
3. **Email Not Sending**: Check email service credentials and app passwords
4. **OAuth Login Issues**: Verify OAuth app configuration and callback URLs

### **Debug Mode**
Enable debug logging by setting `NODE_ENV=development` in `.env`

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


