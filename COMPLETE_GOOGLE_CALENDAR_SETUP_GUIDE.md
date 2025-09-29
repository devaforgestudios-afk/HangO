# HangO Google Calendar Integration - Complete Setup Guide

This comprehensive guide covers everything you need to set up Google Calendar integration with HangO, including both separate credentials architecture and standard setup options.

## 🎯 Overview

The Google Calendar integration enables users to:
- 📅 **Schedule meetings** directly to their Google Calendar
- 🔗 **Auto-generate meeting links** and codes
- 👥 **Invite attendees** via calendar events  
- ⏰ **Get time suggestions** for optimal scheduling
- 📧 **Send email invitations** with meeting details
- 🔄 **Sync with Google Calendar** for upcoming meetings view

## 🏗️ Architecture Options

### Option A: Separate Credentials (Recommended)
- **Calendar access**: Independent Google Calendar API credentials
- **User authentication**: Separate Google OAuth credentials (optional)
- **Benefits**: Users can schedule meetings even without Google OAuth login
- **Use case**: Maximum flexibility and user experience

### Option B: Single Credentials
- **Unified access**: Same credentials for both calendar and authentication
- **Benefits**: Simpler setup, fewer credentials to manage
- **Use case**: When users primarily authenticate via Google

## 📋 Prerequisites

1. **Google Cloud Console Account**: Access to create projects and APIs
2. **Domain/URL**: Your HangO application domain (for OAuth callbacks)
3. **HTTPS**: Required for production (Google Calendar API requirement)
4. **Node.js Environment**: HangO server running with environment variables

## 🚀 Setup Instructions

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the required APIs:

**Required APIs:**
- **Google Calendar API** (for calendar operations)
- **Google+ API** (for user authentication - if using Google OAuth login)

**Enable via Console:**
1. Go to **APIs & Services** → **Library**
2. Search for "Google Calendar API" → Click **Enable**
3. Search for "Google+ API" → Click **Enable** (if using Google login)

**Enable via CLI:**
```bash
gcloud services enable calendar-json.googleapis.com
gcloud services enable plus.googleapis.com
```

### Step 2: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (unless you have Google Workspace)
3. Fill required fields:
   - **App name**: HangO Meeting Scheduler
   - **User support email**: Your email address
   - **Developer contact email**: Your email address
   - **Authorized domains**: Add your domain (e.g., `yourdomain.com`)

4. **Add Scopes** (click "Add or Remove Scopes"):
   ```
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/userinfo.profile (if using Google login)
   https://www.googleapis.com/auth/userinfo.email (if using Google login)
   ```

5. **Add Test Users** (for testing phase):
   - Add your email and any test user emails
   - These users can access the app during development

6. **Submit for Verification** (for production):
   - Required when app goes live with external users

### Step 3: Create OAuth 2.0 Credentials

#### Option A: Separate Credentials (Recommended)

**For Google Calendar API:**
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Choose **Web application**
4. **Name**: "HangO Calendar Access"
5. **Authorized JavaScript origins**:
   ```
   http://localhost:3000  (for development)
   https://yourdomain.com (for production)
   ```
6. **Authorized redirect URIs**:
   ```
   http://localhost:3000/api/calendar/oauth/callback
   https://yourdomain.com/api/calendar/oauth/callback
   ```
7. Save **Client ID** and **Client Secret**

**For General Google OAuth (Optional - for Google login):**
1. Create another OAuth 2.0 Client ID
2. **Name**: "HangO Social Login"
3. **Authorized redirect URIs**:
   ```
   http://localhost:3000/auth/google/callback
   https://yourdomain.com/auth/google/callback
   ```
4. Save **Client ID** and **Client Secret**

#### Option B: Single Credentials

If you prefer using the same credentials for both:
1. Create one OAuth 2.0 Client ID
2. **Name**: "HangO Complete Integration"
3. Add **all redirect URIs**:
   ```
   http://localhost:3000/auth/google/callback
   http://localhost:3000/api/calendar/oauth/callback
   https://yourdomain.com/auth/google/callback  
   https://yourdomain.com/api/calendar/oauth/callback
   ```

### Step 4: Environment Configuration

Create or update your `.env` file in the HangO root directory:

#### Option A: Separate Credentials Configuration
```env
# Domain Configuration
DOMAIN=https://yourdomain.com  # Use http://localhost:3000 for development

# Google Calendar API (Separate Credentials) - RECOMMENDED
GOOGLE_CALENDAR_CLIENT_ID=your-calendar-client-id
GOOGLE_CALENDAR_CLIENT_SECRET=your-calendar-client-secret

# Optional: Google OAuth for Social Login
GOOGLE_CLIENT_ID=your-oauth-client-id  
GOOGLE_CLIENT_SECRET=your-oauth-client-secret

# Session Configuration
SESSION_SECRET=your-super-secret-session-key

# Other configurations...
```

#### Option B: Single Credentials Configuration
```env
# Domain Configuration
DOMAIN=https://yourdomain.com

# Google OAuth (Single Credentials for both Calendar and Auth)
GOOGLE_CLIENT_ID=your-single-client-id
GOOGLE_CLIENT_SECRET=your-single-client-secret

# Session Configuration
SESSION_SECRET=your-super-secret-session-key
```

### Step 5: Install Dependencies

Ensure required packages are installed:
```bash
cd e:\HangO\HangO
npm install googleapis moment
```

### Step 6: Test the Integration

1. **Start HangO server**:
   ```bash
   npm start
   # Or
   node server.js
   ```

2. **Check server health**:
   ```bash
   curl http://localhost:3000/api/health
   ```
   Should return:
   ```json
   {
     "status": "OK",
     "googleCalendar": true
   }
   ```

3. **Test calendar status**:
   ```bash
   curl http://localhost:3000/api/calendar/status
   ```
   Should return:
   ```json
   {
     "connected": false,
     "configured": true
   }
   ```

4. **Test in browser**:
   - Go to `http://localhost:3000/dashboard`
   - Check the calendar status indicator
   - Click "Schedule Meeting" to test the flow

## 👤 User Experience Flow

### First Time Calendar Connection:
1. User visits HangO Dashboard
2. Calendar status shows "Not Connected" (yellow indicator)
3. User clicks "Schedule Meeting"
4. System prompts "Connect Google Calendar"
5. User authorizes HangO calendar access
6. User is redirected back with success message
7. Calendar status shows "Connected" (green indicator)
8. User can now schedule meetings

### Scheduling a Meeting:
1. User clicks "Schedule Meeting" button
2. Modal opens with meeting form:
   - **Title**: Meeting name
   - **Description**: Optional details
   - **Start Date/Time**: When meeting starts
   - **End Date/Time**: When meeting ends
   - **Attendees**: Email addresses (optional)
3. User submits form
4. System creates:
   - HangO meeting room with unique code
   - Google Calendar event with meeting link
   - Email invitations to attendees (if provided)
5. User receives confirmation with meeting details

## 🔧 API Endpoints Reference

### Calendar Status
```http
GET /api/calendar/status
```
**Response:**
```json
{
  "connected": true|false,
  "configured": true|false
}
```

### Get Authorization URL
```http
GET /api/calendar/auth-url
```
**Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

### OAuth Callback (Automatic)
```http
GET /api/calendar/oauth/callback?code=<auth_code>&state=<state>
```
Handles OAuth callback and stores user tokens.

### Schedule Meeting
```http
POST /api/calendar/schedule-meeting
Content-Type: application/json

{
  "title": "Team Standup",
  "description": "Daily team synchronization meeting",
  "startDateTime": "2025-09-30T10:00:00.000Z",
  "endDateTime": "2025-09-30T11:00:00.000Z",
  "timeZone": "America/New_York",
  "attendees": [
    {"email": "user1@example.com"},
    {"email": "user2@example.com"}
  ]
}
```

### Get Upcoming Meetings
```http
GET /api/calendar/upcoming-meetings
```
Returns user's upcoming HangO meetings from Google Calendar.

## 🔒 Security & Privacy

### Token Management
- **Development**: Tokens stored in session memory
- **Production**: Consider encrypted database storage
- **Refresh**: Tokens automatically refreshed when needed
- **Expiration**: Graceful handling of expired tokens

### Permissions & Consent
- **Minimal Scope**: Only necessary calendar permissions
- **User Consent**: Explicit authorization required
- **Revocation**: Users can revoke access in Google Account settings
- **Transparency**: Clear explanation of what access is used for

### Data Protection
- **No Permanent Storage**: Calendar data not stored long-term
- **Encrypted Transit**: All API calls use HTTPS
- **Limited Access**: Only HangO-created events are managed
- **Privacy Compliant**: Follows Google API privacy requirements

## 🐛 Troubleshooting

### Common Issues

**❌ "Google Calendar not configured"**
- ✅ Check `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` in `.env`
- ✅ Verify Google Calendar API is enabled in Google Cloud Console
- ✅ Restart server after updating environment variables

**❌ "OAuth callback failed"**
- ✅ Check redirect URI matches exactly in Google Cloud Console
- ✅ Ensure domain configuration is correct in `.env`
- ✅ Verify HTTPS is used in production
- ✅ Check authorized JavaScript origins are configured

**❌ "Calendar not connected"**
- ✅ User needs to complete Google Calendar authorization flow
- ✅ Check if tokens expired (auto-refresh should handle this)
- ✅ Clear browser cache and cookies, try again
- ✅ Verify user has Google Calendar access

**❌ "Failed to create calendar event"**
- ✅ Check user has calendar write permissions
- ✅ Verify date/time format and time zone
- ✅ Ensure attendee email addresses are valid
- ✅ Check for calendar API rate limits

### Debug Mode

Enable detailed logging:
```bash
# In .env file
DEBUG=hango:calendar

# Or set environment variable
export DEBUG=hango:calendar
node server.js
```

### Manual API Testing

Test OAuth flow manually:
```bash
# 1. Get authorization URL
curl http://localhost:3000/api/calendar/auth-url

# 2. Visit the authUrl in browser and complete authorization

# 3. Check connection status (include session cookie)
curl http://localhost:3000/api/calendar/status \
  -H "Cookie: connect.sid=your-session-id"

# 4. Test meeting creation
curl -X POST http://localhost:3000/api/calendar/schedule-meeting \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-id" \
  -d '{
    "title": "Test Meeting",
    "startDateTime": "2025-09-30T15:00:00.000Z",
    "endDateTime": "2025-09-30T16:00:00.000Z"
  }'
```

## 🚀 Production Deployment

### HTTPS Requirements
Google Calendar API requires HTTPS in production. Use a reverse proxy:

**Nginx Configuration:**
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Production Environment
```env
NODE_ENV=production
DOMAIN=https://yourdomain.com
GOOGLE_CALENDAR_CLIENT_ID=your-production-calendar-client-id
GOOGLE_CALENDAR_CLIENT_SECRET=your-production-calendar-client-secret
SESSION_SECRET=super-secure-production-secret-min-32-chars
```

### Google Cloud Console Updates
Update OAuth configuration for production:
- **Authorized JavaScript origins**: `https://yourdomain.com`
- **Redirect URIs**: `https://yourdomain.com/api/calendar/oauth/callback`
- **Submit app for verification** if using sensitive scopes

## 📈 Advanced Features & Extensions

### Multi-Calendar Support
```javascript
// Allow users to choose which calendar to use
app.get('/api/calendar/calendars', async (req, res) => {
  const calendars = await calendarService.getCalendarList(req.session.googleCalendarTokens);
  res.json(calendars);
});
```

### Recurring Meetings
```javascript
// Support for repeating events
const recurringEvent = {
  title: "Weekly Standup",
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO']
};
```

### Availability Checking
```javascript
// Check attendee availability before scheduling
app.post('/api/calendar/check-availability', async (req, res) => {
  const { attendees, timeMin, timeMax } = req.body;
  const availability = await calendarService.checkAvailability(attendees, timeMin, timeMax);
  res.json(availability);
});
```

### Webhook Integration
```javascript
// Real-time calendar updates via webhooks
app.post('/api/calendar/webhook', (req, res) => {
  const { eventType, calendarId } = req.body;
  // Handle calendar event changes
  updateHangOMeeting(eventType, calendarId);
  res.status(200).send('OK');
});
```

## 📞 Support & Resources

### Documentation Links
- [Google Calendar API Documentation](https://developers.google.com/calendar)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)

### Getting Help
1. **Check server logs**: Enable debug mode for detailed error information
2. **Verify configuration**: Ensure all setup steps completed correctly  
3. **Test API endpoints**: Use curl/Postman to test individual endpoints
4. **Review permissions**: Check Google Cloud Console OAuth configuration
5. **Check quotas**: Verify API usage limits not exceeded

### Common Success Indicators
- ✅ Server starts without errors
- ✅ `/api/calendar/status` returns `"configured": true`
- ✅ Calendar status indicator shows appropriate state in dashboard
- ✅ OAuth flow completes successfully
- ✅ Meeting creation works end-to-end

---

This comprehensive guide provides everything needed to successfully integrate Google Calendar with HangO, supporting both flexible separate credentials architecture and traditional single credentials approach based on your specific needs and user experience requirements.