/**
 * Google Calendar Service for HangO
 * Handles meeting scheduling with Google Calendar API
 */

const { google } = require('googleapis');
const moment = require('moment');

class GoogleCalendarService {
  constructor() {
    this.oauth2Client = null;
    this.calendar = null;
    this.isConfigured = false;
    this.init();
  }

  init() {
    try {
      // Use separate Google Calendar API credentials if available, fallback to general Google OAuth
      const calendarClientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
      const calendarClientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
      
      if (!calendarClientId || !calendarClientSecret) {
        console.log('⚠️  Google Calendar: OAuth credentials not configured');
        console.log('💡 Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET for dedicated calendar access');
        console.log('💡 Or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for general Google OAuth');
        return;
      }

      // Initialize OAuth2 client with calendar-specific callback
      this.oauth2Client = new google.auth.OAuth2(
        calendarClientId,
        calendarClientSecret,
        `${process.env.DOMAIN || 'http://localhost:3000'}/api/calendar/oauth/callback`
      );

      // Set up Calendar API
      this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      this.isConfigured = true;
      
      const usingDedicated = process.env.GOOGLE_CALENDAR_CLIENT_ID ? 'dedicated calendar' : 'general OAuth';
      console.log(`✅ Google Calendar service initialized (using ${usingDedicated} credentials)`);
    } catch (error) {
      console.error('❌ Google Calendar initialization error:', error.message);
    }
  }

  /**
   * Generate OAuth URL for Google Calendar access
   */
  getAuthUrl() {
    if (!this.isConfigured) {
      throw new Error('Google Calendar not configured');
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  /**
   * Set credentials from OAuth callback
   */
  async setCredentials(code) {
    if (!this.isConfigured) {
      throw new Error('Google Calendar not configured');
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  /**
   * Set stored credentials for a user
   */
  setStoredCredentials(tokens) {
    if (!this.isConfigured) {
      throw new Error('Google Calendar not configured');
    }
    
    this.oauth2Client.setCredentials(tokens);
  }

  /**
   * Create a calendar event for a HangO meeting
   */
  async createMeetingEvent(eventData, userTokens) {
    try {
      if (!this.isConfigured) {
        throw new Error('Google Calendar not configured');
      }

      // Set user's credentials
      this.oauth2Client.setCredentials(userTokens);

      // Prepare event data
      const event = {
        summary: eventData.title || 'HangO Meeting',
        description: this.formatMeetingDescription(eventData),
        start: {
          dateTime: eventData.startDateTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        end: {
          dateTime: eventData.endDateTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        attendees: eventData.attendees || [],
        conferenceData: {
          createRequest: {
            requestId: `hango-${eventData.meetingCode}-${Date.now()}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 15 },
            { method: 'popup', minutes: 5 }
          ]
        },
        location: eventData.meetingUrl,
        visibility: 'default'
      };

      // Create the event
      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'all'
      });

      console.log('✅ Calendar event created:', response.data.id);
      return {
        success: true,
        eventId: response.data.id,
        eventUrl: response.data.htmlLink,
        hangoutLink: response.data.hangoutLink,
        event: response.data
      };

    } catch (error) {
      console.error('❌ Calendar event creation error:', error);
      throw new Error(`Failed to create calendar event: ${error.message}`);
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateMeetingEvent(eventId, eventData, userTokens) {
    try {
      if (!this.isConfigured) {
        throw new Error('Google Calendar not configured');
      }

      this.oauth2Client.setCredentials(userTokens);

      const event = {
        summary: eventData.title || 'HangO Meeting',
        description: this.formatMeetingDescription(eventData),
        start: {
          dateTime: eventData.startDateTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        end: {
          dateTime: eventData.endDateTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        attendees: eventData.attendees || [],
        location: eventData.meetingUrl
      };

      const response = await this.calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: event,
        sendUpdates: 'all'
      });

      return {
        success: true,
        event: response.data
      };

    } catch (error) {
      console.error('❌ Calendar event update error:', error);
      throw new Error(`Failed to update calendar event: ${error.message}`);
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteMeetingEvent(eventId, userTokens) {
    try {
      if (!this.isConfigured) {
        throw new Error('Google Calendar not configured');
      }

      this.oauth2Client.setCredentials(userTokens);

      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
        sendUpdates: 'all'
      });

      return { success: true };

    } catch (error) {
      console.error('❌ Calendar event deletion error:', error);
      throw new Error(`Failed to delete calendar event: ${error.message}`);
    }
  }

  /**
   * Get user's upcoming meetings from calendar
   */
  async getUpcomingMeetings(userTokens, maxResults = 10) {
    try {
      if (!this.isConfigured) {
        throw new Error('Google Calendar not configured');
      }

      this.oauth2Client.setCredentials(userTokens);

      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime',
        q: 'HangO Meeting'
      });

      const events = response.data.items || [];
      
      return events.map(event => ({
        id: event.id,
        title: event.summary,
        description: event.description,
        startTime: event.start.dateTime || event.start.date,
        endTime: event.end.dateTime || event.end.date,
        attendees: event.attendees || [],
        location: event.location,
        htmlLink: event.htmlLink,
        hangoutLink: event.hangoutLink
      }));

    } catch (error) {
      console.error('❌ Calendar events retrieval error:', error);
      throw new Error(`Failed to get calendar events: ${error.message}`);
    }
  }

  /**
   * Check if user has valid calendar access
   */
  async validateAccess(userTokens) {
    try {
      if (!this.isConfigured) {
        return false;
      }

      this.oauth2Client.setCredentials(userTokens);
      
      // Try to access calendar
      await this.calendar.calendarList.list();
      return true;
      
    } catch (error) {
      console.log('❌ Calendar access validation failed:', error.message);
      return false;
    }
  }

  /**
   * Refresh access token if needed
   */
  async refreshTokenIfNeeded(userTokens) {
    try {
      if (!this.isConfigured || !userTokens.refresh_token) {
        return userTokens;
      }

      this.oauth2Client.setCredentials(userTokens);
      
      // Check if token needs refresh
      const tokenInfo = await this.oauth2Client.getTokenInfo(userTokens.access_token);
      
      // If token expires in less than 5 minutes, refresh it
      if (tokenInfo.expiry_date && tokenInfo.expiry_date < (Date.now() + 5 * 60 * 1000)) {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        return credentials;
      }
      
      return userTokens;
      
    } catch (error) {
      console.error('❌ Token refresh error:', error);
      return userTokens;
    }
  }

  /**
   * Format meeting description for calendar
   */
  formatMeetingDescription(eventData) {
    const { meetingCode, meetingUrl, description, organizer } = eventData;
    
    return `🎯 HangO Meeting

${description || 'Join us for a HangO video meeting!'}

📋 Meeting Details:
• Meeting Code: ${meetingCode}
• Join URL: ${meetingUrl}
• Organizer: ${organizer || 'HangO User'}

🚀 How to Join:
1. Click the meeting link above
2. Or go to ${process.env.DOMAIN || 'http://localhost:3000'} and enter code: ${meetingCode}
3. Enable your camera and microphone
4. Start collaborating!

💡 Features Available:
• HD Video & Audio calling
• Screen sharing
• Real-time chat
• Multi-participant support

Powered by HangO 🌟`;
  }

  /**
   * Generate meeting times suggestions
   */
  generateMeetingTimes(duration = 60) {
    const times = [];
    const now = moment();
    
    // Round to next quarter hour
    const startTime = now.clone().add(15 - (now.minute() % 15), 'minutes').second(0);
    
    // Generate 8 time slots over the next 2 weeks
    for (let i = 0; i < 8; i++) {
      const time = startTime.clone().add(i < 4 ? i * 2 : (i - 4) * 24 + 24, 'hours');
      
      times.push({
        start: time.toISOString(),
        end: time.clone().add(duration, 'minutes').toISOString(),
        label: time.format('MMM D, YYYY at h:mm A'),
        dayLabel: time.format('dddd'),
        timeLabel: time.format('h:mm A')
      });
    }
    
    return times;
  }
}

module.exports = GoogleCalendarService;