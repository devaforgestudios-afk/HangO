# HangO Meeting Functionality - Database Setup

## Overview
HangO now supports full meeting functionality for both authenticated and anonymous users. Users can create meetings, join meetings, and manage meeting sessions with persistent storage in Airtable.

## Required Airtable Table: Meetings

You need to create a new table called **"Meetings"** in your Airtable base with the following fields:

### Meetings Table Fields

| Field Name | Type | Description | Required |
|------------|------|-------------|----------|
| `meeting_code` | Single line text | Unique meeting identifier (6-8 chars) | ✅ Yes |
| `title` | Single line text | Meeting display title | ✅ Yes |
| `created_by_user_id` | Single line text | User ID who created meeting (empty for anonymous) | ✅ Yes |
| `created_by_name` | Single line text | Display name of creator | ✅ Yes |
| `is_anonymous` | Checkbox | Whether creator was anonymous | ✅ Yes |
| `status` | Single select | Meeting status: "active", "ended" | ✅ Yes |
| `participants` | Long text | JSON string of participant data | ✅ Yes |
| `settings` | Long text | JSON string of meeting settings | ✅ Yes |
| `created_at` | Date | When meeting was created | ✅ Yes |
| `ended_at` | Date | When meeting ended (empty if active) | ✅ Yes |
| `ended_by_user_id` | Single line text | User ID who ended meeting | ❌ Optional |

### Field Setup Instructions

1. **Open your Airtable base**
2. **Create new table**: Click "+" and name it "Meetings"
3. **Add each field** with the exact name and type specified above
4. **Configure Single Select field** (`status`):
   - Add options: "active", "ended"
   - Set "active" as default
5. **Configure Date fields**: 
   - Include time: Yes
   - Use same timezone as your server

## Meeting Features

### For All Users (Authenticated & Anonymous)

**Create Meeting**:
- ✅ Generate unique meeting codes
- ✅ Set custom meeting titles
- ✅ Configure audio/video settings
- ✅ Start meetings immediately

**Join Meeting**:
- ✅ Join by meeting code
- ✅ Auto-validate meeting codes
- ✅ Display meeting details
- ✅ Track participants
- ✅ **Multiple participants can join the same meeting**
- ✅ **Support for anonymous and authenticated users simultaneously**

**During Meeting**:
- ✅ View meeting title and code
- ✅ Copy meeting link
- ✅ Generate new meeting codes
- ✅ Basic meeting controls
- ✅ **Real-time participant tracking**
- ✅ **Leave meeting functionality**

**Meeting Lifecycle**:
- ✅ **Auto-cleanup: Ended meetings are automatically deleted from database**
- ✅ **Auto-cleanup: Abandoned meetings (24+ hours) are removed**
- ✅ **Auto-cleanup: Empty meetings (1+ hour with no participants) are removed**
- ✅ **Auto-end: Meetings end when all participants leave**

### For Authenticated Users Only

**Additional Features**:
- ✅ Meeting history tracking
- ✅ Meeting statistics
- ✅ User attribution for created meetings
- ✅ Enhanced meeting management

**API Endpoints**:
- `GET /api/user/meetings` - Get user's meeting history

## API Endpoints

### Public Endpoints (No Authentication Required)

```javascript
POST /api/meeting/create
// Create a new meeting
// Body: { meeting_code?, title?, settings?, anonymous_name? }

POST /api/meeting/join  
// Join a meeting (supports multiple participants)
// Body: { meeting_code, anonymous_name?, session_id? }

GET /api/meeting/:code
// Get meeting details
// Returns meeting info and participants list

POST /api/meeting/end
// End a meeting (deletes from database)
// Body: { meeting_code }

POST /api/meeting/leave
// Leave a meeting (remove participant)
// Body: { meeting_code, session_id? }
```

### Authenticated Endpoints

```javascript
GET /api/user/meetings
// Get user's meeting history
// Requires authentication
```

## Frontend Integration

### Meeting Creation Flow

1. User clicks "Create Meeting" or "Quick Join"
2. Frontend calls `POST /api/meeting/create`
3. Server creates meeting in database
4. User redirected to `/meet.html?code=XXXXXX`
5. Meet page loads meeting details from API

### Meeting Join Flow

1. User enters meeting code and clicks "Join"
2. Frontend calls `POST /api/meeting/join`
3. Server validates code and adds participant
4. User redirected to meeting page
5. Meeting details loaded and displayed

### Anonymous vs Authenticated

**Anonymous Users**:
- Meeting creator stored as "Anonymous User"
- No meeting history tracking
- `created_by_user_id` is empty
- `is_anonymous` is `true`

**Authenticated Users**:
- Meeting creator linked to user account
- Meeting statistics updated
- Full meeting history available
- `created_by_user_id` contains actual user ID
- `is_anonymous` is `false`

## Data Examples

### Meeting Record (Anonymous User)
```json
{
  "meeting_code": "XYZ123",
  "title": "Quick Meeting",
  "created_by_user_id": "",
  "created_by_name": "Anonymous User",
  "is_anonymous": true,
  "status": "active",
  "participants": "[]",
  "settings": "{\"enableVideo\":true,\"enableAudio\":true}",
  "created_at": "2025-01-15T10:30:00Z",
  "ended_at": ""
}
```

### Meeting Record (Authenticated User)
```json
{
  "meeting_code": "ABC789",
  "title": "Team Standup",
  "created_by_user_id": "recXXXXXXXXXXXXXX",
  "created_by_name": "john_doe",
  "is_anonymous": false,
  "status": "ended",
  "participants": "[{\"user_id\":\"\",\"name\":\"Guest\",\"joined_at\":\"2025-01-15T10:35:00Z\"}]",
  "settings": "{\"enableVideo\":true,\"enableAudio\":false}",
  "created_at": "2025-01-15T10:30:00Z",
  "ended_at": "2025-01-15T11:00:00Z"
}
```

## User Statistics

The system automatically updates user meeting statistics:
- `total_meetings` field in Users table gets incremented
- Only counts completed (ended) meetings
- Updated when meetings end

## Error Handling

**Common Scenarios**:
- ✅ Meeting not found (invalid code)
- ✅ Meeting already ended  
- ✅ Database connection issues
- ✅ Invalid meeting data
- ✅ Anonymous user limitations

## Testing

After setting up the Meetings table, you can test:

1. **Anonymous Meeting Creation**:
   - Visit homepage without logging in
   - Create a new meeting
   - Verify meeting appears in Airtable

2. **Anonymous Meeting Joining**:
   - Use meeting code to join
   - Verify participant tracking

3. **Authenticated Features**:
   - Login and create meetings
   - Check meeting history in dashboard
   - Verify user statistics

4. **Error Cases**:
   - Try invalid meeting codes
   - Test with missing fields

## Next Steps

1. **Set up Meetings table** in Airtable with all required fields
2. **Restart your server** to ensure database connections work
3. **Test meeting creation** both authenticated and anonymous
4. **Verify meeting data** appears correctly in Airtable
5. **Test joining meetings** with generated codes

## 🆕 Latest Updates

### 🗑️ **Automatic Meeting Deletion**
- **Ended meetings** are now automatically **deleted** from the database (not just marked as "ended")
- **Abandoned meetings** (active for 24+ hours) are automatically cleaned up every hour
- **Empty meetings** (no participants for 1+ hour) are automatically removed
- **Database stays clean** - no accumulation of old meeting records

### 👥 **Multiple Participants Support** 
- **Unlimited participants** can join the same meeting simultaneously
- **Anonymous users** get unique session IDs for proper tracking
- **Authenticated users** can rejoin meetings (updates their participant record)
- **Mixed meetings** support both anonymous and authenticated users in the same room
- **Real-time participant tracking** with join/leave events
- **Auto-end meetings** when the last participant leaves

### 📊 **Enhanced Participant Tracking**
```javascript
// New participant data structure
{
  user_id: "user123",           // Empty for anonymous users
  name: "Display Name",         // User name or anonymous name  
  is_anonymous: true/false,     // User authentication status
  joined_at: "ISO timestamp",   // When participant joined
  session_id: "abc123xyz"       // Unique session ID for tracking
}
```

### 🔄 **New API Endpoints**
- `POST /api/meeting/leave` - Remove participant from meeting
- Enhanced `POST /api/meeting/join` - Better multi-participant support
- Enhanced `POST /api/meeting/end` - Now deletes meeting from database

### 🧹 **Automatic Cleanup System**
The server runs background cleanup every hour to:
1. Delete meetings active for 24+ hours (abandoned)
2. Delete meetings with no participants for 1+ hour (empty)  
3. Keep the database clean and performant

Your HangO application now has full meeting functionality with multi-participant support and automatic cleanup! 🎉