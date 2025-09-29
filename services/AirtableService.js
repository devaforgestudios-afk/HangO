const Airtable = require('airtable');
const bcrypt = require('bcryptjs');

class AirtableService {
  constructor() {
    // Initialize Airtable with Personal Access Token
    this.base = new Airtable({
      apiKey: process.env.AIRTABLE_API_KEY,
      endpointUrl: 'https://api.airtable.com'
    }).base(process.env.AIRTABLE_BASE_ID);
    
    this.usersTable = this.base('Users');
    this.meetingsTable = this.base('Meetings');
  }

  // Hash password
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  // Verify password
  async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Create new user
  async createUser(userData) {
    const { fullName, username, email, phone, password, avatar, avatar_url } = userData;
    
    // Use avatar_url if provided, otherwise fall back to avatar for backward compatibility
    const finalAvatarUrl = avatar_url || avatar || '';
    const { v4: uuidv4 } = require('uuid');
    // Validation
    if (!fullName || fullName.trim().length < 2) {
      throw new Error('Full name must be at least 2 characters long');
    }
    if (!username || username.length < 3) {
      throw new Error('Username must be at least 3 characters long');
    }
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      throw new Error('Valid email is required');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
    // Validate phone number format if provided
    if (phone && phone.trim() && !/^\+\d+\s[\d\s\(\)\-]+$/.test(phone.trim())) {
      throw new Error('Invalid phone number format');
    }
    try {
      // Check for existing username or email
      const existingUsers = await this.usersTable.select({
        filterByFormula: `OR({username} = '${username}', {email} = '${email}')`,
        fields: ['username', 'email']
      }).firstPage();
      if (existingUsers.length > 0) {
        const existingUser = existingUsers[0].fields;
        if (existingUser.username === username) {
          throw new Error('Username already exists');
        }
        if (existingUser.email === email) {
          throw new Error('Email already registered');
        }
      }
      // Hash password
      const passwordHash = await this.hashPassword(password);
      // Generate verification token
      const verificationToken = uuidv4();
      // Create user record
      const records = await this.usersTable.create([
        {
          fields: {
            full_name: fullName.trim(),
            username,
            email,
            phone: phone || '',
            password_hash: passwordHash,
            avatar_url: finalAvatarUrl,
            provider: 'email', // Regular registration uses email provider
            provider_id: '', // Email users don't have external provider IDs
            is_verified: false,
            verification_token: verificationToken,
            created_at: new Date().toISOString()
          }
        }
      ]);
      const newUser = records[0];
      return {
        id: newUser.id,
        fullName: newUser.fields.full_name,
        username: newUser.fields.username,
        email: newUser.fields.email,
        phone: newUser.fields.phone,
        avatar_url: newUser.fields.avatar_url,
        provider: newUser.fields.provider,
        provider_id: newUser.fields.provider_id,
        is_verified: newUser.fields.is_verified,
        verification_token: newUser.fields.verification_token,
        created_at: newUser.fields.created_at
      };
    } catch (error) {
      if (error && error.error && error.error.message) {
        console.error('Airtable create user error:', error.error.message, error.error);
      } else {
        console.error('Airtable create user error:', error);
      }
      throw error;
    }
  }

  // Find user by email across all providers
  async findUserByEmail(email) {
    try {
      if (!email) return null;
      
      const records = await this.usersTable.select({
        filterByFormula: `{email} = '${email}'`,
        maxRecords: 1
      }).firstPage();

      if (records.length === 0) {
        return null;
      }

      const user = records[0];
      return {
        id: user.id,
        full_name: user.fields.full_name,
        username: user.fields.username,
        email: user.fields.email,
        phone: user.fields.phone,
        avatar_url: user.fields.avatar_url || '',
        provider: user.fields.provider || 'email',
        provider_id: user.fields.provider_id,
        password_hash: user.fields.password_hash,
        is_verified: user.fields.is_verified,
        created_at: user.fields.created_at
      };

    } catch (error) {
      console.error('Airtable find user by email error:', error);
      return null;
    }
  }

  // Create OAuth user (GitHub/Google) with email duplicate prevention
  async createOAuthUser(userData) {
    const { username, full_name, email, phone, avatar_url, provider, provider_id, is_verified, profile_completed } = userData;
    
    try {
      // First, check if user already exists by provider ID (exact same account)
      let user = await this.findUserByProvider(provider, provider_id);
      if (user) {
        console.log(`✅ Existing ${provider} user found with same provider ID:`, user.username);
        return { user, isNewUser: false };
      }

      if (email) {
        const existingUserByEmail = await this.findUserByEmail(email);
        if (existingUserByEmail) {
          console.log(`⚠️ Email ${email} already exists with provider: ${existingUserByEmail.provider}`);
    
          if (existingUserByEmail.provider === 'email') {
            // User signed up with email/password, now trying OAuth
            throw new Error(`An account with email ${email} already exists. Please log in using your email and password, or use the "Link Account" feature to connect your ${provider} account.`);
          } else if (existingUserByEmail.provider !== provider) {
            // User has OAuth account with different provider
            throw new Error(`An account with email ${email} already exists using ${existingUserByEmail.provider}. Please log in with ${existingUserByEmail.provider} or use a different email address.`);
          }
        }
      }

      // Check for username conflicts and generate unique username if needed
      let finalUsername = username;
      let existingUserByUsername = await this.findUserByUsername(username);
      
      if (existingUserByUsername) {
        // Check if it's the same user trying to re-authenticate
        if (existingUserByUsername.provider === provider && existingUserByUsername.provider_id === provider_id) {
          console.log(`✅ Found existing user with same ${provider} credentials:`, existingUserByUsername.username);
          return { user: existingUserByUsername, isNewUser: false };
        }
        
        // Generate a unique username by appending provider and numbers
        let counter = 1;
        do {
          finalUsername = `${username}_${provider}${counter > 1 ? counter : ''}`;
          try {
            existingUserByUsername = await this.findUserByUsername(finalUsername);
            if (!existingUserByUsername) break;
          } catch (error) {
            // Username not found, we can use it
            break;
          }
          counter++;
        } while (counter < 100); // Safety limit
        
        console.log(`🔄 Username '${username}' taken, using '${finalUsername}' instead`);
      }

      // Create OAuth user record - only use fields that exist in Airtable
      const userFields = {
        full_name: full_name || finalUsername,
        username: finalUsername,
        email: email || '',
        phone: phone || '', // Will be collected during profile completion
        is_verified: is_verified || true,
        password_hash: '', // OAuth users don't have passwords
        verification_token: '',
        created_at: new Date().toISOString(),
        // OAuth-specific fields
        provider: provider || 'oauth',
        provider_id: provider_id ? provider_id.toString() : '',
        avatar_url: avatar_url || ''
      };

      const records = await this.usersTable.create([
        {
          fields: userFields
        }
      ]);

      const newUser = records[0];
      const createdUser = {
        id: newUser.id,
        full_name: newUser.fields.full_name,
        username: newUser.fields.username,
        email: newUser.fields.email,
        phone: newUser.fields.phone,
        avatar_url: avatar_url || '', 
        provider: provider || 'oauth',
        provider_id: provider_id || '',
        is_verified: newUser.fields.is_verified,
        created_at: newUser.fields.created_at
      };

      console.log(`✅ New ${provider} user created:`, createdUser.username);
      return { user: createdUser, isNewUser: true };

    } catch (error) {
      console.error('Airtable create OAuth user error:', error);
      throw error;
    }
  }

  async findUserByProvider(provider, provider_id) {
    try {
      // For now, since the fields don't exist yet, return null
      // This will cause new users to be created each time
      // Once you add the provider fields to Airtable, uncomment the code below:
      
      /*
      const records = await this.usersTable.select({
        filterByFormula: `AND({provider} = '${provider}', {provider_id} = '${provider_id}')`,
        maxRecords: 1
      }).firstPage();

      if (records.length === 0) {
        return null;
      }

      const user = records[0];
      return {
        id: user.id,
        full_name: user.fields.full_name,
        username: user.fields.username,
        email: user.fields.email,
        phone: user.fields.phone,
        avatar_url: user.fields.avatar_url,
        provider: user.fields.provider,
        provider_id: user.fields.provider_id,
        is_verified: user.fields.is_verified,
        created_at: user.fields.created_at
      };
      */
      
      return null; // Temporary: always create new users until fields are added

    } catch (error) {
      console.error('Airtable find user by provider error:', error);
      return null;
    }
  }

  // Find user by ID (for session deseralization)
  async findUserById(id) {
    try {
      const record = await this.usersTable.find(id);
      
      return {
        id: record.id,
        full_name: record.fields.full_name,
        username: record.fields.username,
        email: record.fields.email,
        phone: record.fields.phone,
        avatar_url: record.fields.avatar_url || '',
        provider: record.fields.provider,
        provider_id: record.fields.provider_id,
        password_hash: record.fields.password_hash,
        is_verified: record.fields.is_verified,
        created_at: record.fields.created_at,
        total_meetings: record.fields.total_meetings || 0,
        total_connections: record.fields.total_connections || 0,
        total_hours: record.fields.total_hours || 0
      };

    } catch (error) {
      console.error('Airtable find user by ID error:', error);
      return null;
    }
  }

  // Update user profile
  async updateUserProfile(userId, updateData) {
    try {
      const { full_name, username, email, phone, avatar_url } = updateData;
      
      // Prepare update fields
      const updateFields = {};
      
      if (full_name) {
        updateFields.full_name = full_name.trim();
      }
      
      if (username) {
        updateFields.username = username.trim();
      }
      
      if (email) {
        updateFields.email = email.trim().toLowerCase();
      }
      
      if (phone !== undefined) {
        updateFields.phone = phone.trim();
      }
      
      if (avatar_url !== undefined) {
        updateFields.avatar_url = avatar_url.trim();
      }
      
      // Add updated timestamp
      updateFields.updated_at = new Date().toISOString();

      // Update the record
      const updatedRecord = await this.usersTable.update(userId, updateFields);
      
      return {
        id: updatedRecord.id,
        full_name: updatedRecord.fields.full_name,
        username: updatedRecord.fields.username,
        email: updatedRecord.fields.email,
        phone: updatedRecord.fields.phone || '',
        avatar_url: updatedRecord.fields.avatar_url || '',
        provider: updatedRecord.fields.provider,
        is_verified: updatedRecord.fields.is_verified,
        created_at: updatedRecord.fields.created_at,
        updated_at: updatedRecord.fields.updated_at
      };

    } catch (error) {
      console.error('❌ Update user profile error:', error);
      throw new Error('Failed to update user profile');
    }
  }

  // Find user by username
  async findUserByUsername(username) {
    try {
      const records = await this.usersTable.select({
        filterByFormula: `{username} = '${username}'`,
        maxRecords: 1
      }).firstPage();

      if (records.length === 0) {
        return null;
      }

      const user = records[0];
      return {
        id: user.id,
        fullName: user.fields.full_name,
        username: user.fields.username,
        email: user.fields.email,
        phone: user.fields.phone,
        avatar_url: user.fields.avatar_url,
        provider: user.fields.provider,
        provider_id: user.fields.provider_id,
        password_hash: user.fields.password_hash,
        is_verified: user.fields.is_verified,
        created_at: user.fields.created_at
      };

    } catch (error) {
      if (error && error.error && error.error.message) {
        console.error('Airtable find user error:', error.error.message, error.error);
      } else {
        console.error('Airtable find user error:', error);
      }
      throw error;
    }
  }

  // Get user profile (without password)
  async getUserProfile(userId) {
    try {
      const record = await this.usersTable.find(userId);
      
      return {
        id: record.id,
        fullName: record.fields.full_name,
        username: record.fields.username,
        email: record.fields.email,
        phone: record.fields.phone,
        avatar_url: record.fields.avatar_url,
        provider: record.fields.provider,
        provider_id: record.fields.provider_id,
        is_verified: record.fields.is_verified,
        created_at: record.fields.created_at
      };

    } catch (error) {
      if (error && error.error && error.error.message) {
        console.error('Airtable get profile error:', error.error.message, error.error);
      } else {
        console.error('Airtable get profile error:', error);
      }
      return null;
    }
  }

  // Get all users (for admin purposes)
  async getAllUsers() {
    try {
      const records = await this.usersTable.select({
        fields: ['username', 'email', 'phone', 'full_name', 'avatar', 'is_verified', 'created_at'],
        sort: [{field: 'created_at', direction: 'desc'}]
      }).firstPage();

      return records.map(record => ({
        id: record.id,
        username: record.fields.username,
        email: record.fields.email,
        phone: record.fields.phone,
        fullName: record.fields.full_name,
        avatar: record.fields.avatar,
        is_verified: record.fields.is_verified,
        created_at: record.fields.created_at
      }));

    } catch (error) {
      if (error && error.error && error.error.message) {
        console.error('Airtable get all users error:', error.error.message, error.error);
      } else {
        console.error('Airtable get all users error:', error);
      }
      throw error;
    }
  }

  // Test Airtable connection
  async testConnection() {
    try {
      // Try to list records (limit to 1 to minimize API usage)
      await this.usersTable.select({
        maxRecords: 1,
        fields: ['username']
      }).firstPage();
      
      return true;
    } catch (error) {
      if (error && error.error && error.error.message) {
        console.error('Airtable connection test failed:', error.error.message, error.error);
      } else {
        console.error('Airtable connection test failed:', error.message);
      }
      if (error.message && error.message.includes('Unknown field name')) {
        console.error('❌ Please create the Users table with required fields in your Airtable base');
        console.error('📝 Required fields: username, email, phone, full_name, password_hash, provider, provider_id, avatar_url, is_verified, verification_token, created_at');
      }
      return false;
    }
  }

  async generatePasswordResetToken(email) {
    try {
      // First check if user exists
      const existingUser = await this.findUserByEmail(email);
      if (!existingUser) {
        console.log('❌ Password reset attempted for non-existent email:', email);
        throw new Error('No account found with this email address. Please check your email or create a new account.');
      }

      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); 

      try {
       
        await this.usersTable.update(existingUser.id, {
          'reset_token': resetToken,
          'reset_expires': resetExpires.toISOString()
        });
        
        console.log('✅ Password reset token generated for:', email);
        return {
          token: resetToken,
          user: {
            id: existingUser.id,
            email: existingUser.email,
            username: existingUser.username
          }
        };
      } catch (updateError) {
        if (updateError.message && updateError.message.includes('Unknown field name')) {
          console.error('❌ Missing required Airtable fields for password reset');
          console.error('📋 Please add these fields to your Users table in Airtable:');
          console.error('   1. reset_token (Single line text)');
          console.error('   2. reset_expires (Date with time)');
          throw new Error('Password reset requires database setup. Please add "reset_token" (Single line text) and "reset_expires" (Date) fields to your Users table in Airtable.');
        }
        throw updateError;
      }
    } catch (error) {
      console.error('❌ Error generating reset token:', error.message);
      throw error;
    }
  }

  async verifyPasswordResetToken(token) {
    try {
      const records = await this.usersTable.select({
        filterByFormula: `{reset_token} = '${token}'`
      }).firstPage();

      if (records.length === 0) {
        throw new Error('Invalid or expired reset token');
      }

      const user = records[0];
      
      if (!user.fields.reset_expires) {
        throw new Error('Invalid reset token - no expiration found');
      }
      
      const resetExpires = new Date(user.fields.reset_expires);
      
      if (resetExpires < new Date()) {
        throw new Error('Reset token has expired. Please request a new password reset.');
      }

      return {
        id: user.id,
        email: user.fields.email,
        username: user.fields.username
      };
    } catch (error) {
      if (error.message && error.message.includes('Unknown field name')) {
        console.error('❌ Missing required Airtable fields for password reset');
        console.error('📋 Please add these fields to your Users table in Airtable:');
        console.error('   1. reset_token (Single line text)');
        console.error('   2. reset_expires (Date with time)');
        throw new Error('Password reset requires database setup. Please add "reset_token" (Single line text) and "reset_expires" (Date) fields to your Users table in Airtable.');
      }
      console.error('❌ Error verifying reset token:', error.message);
      throw error;
    }
  }

  async resetPasswordWithToken(token, newPassword) {
    try {
      // Verify the token first
      const user = await this.verifyPasswordResetToken(token);
      
      const bcrypt = require('bcryptjs');
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      console.log('🔐 Updating password hash for user:', user.email);

      await this.usersTable.update(user.id, {
        'password_hash': hashedPassword,
        'reset_token': null,
        'reset_expires': null
      });

      console.log('✅ Password reset successfully for:', user.email);
      return user;
    } catch (error) {
      if (error.message && error.message.includes('Unknown field name')) {
        console.error('❌ Missing required Airtable fields for password reset');
        console.error('📋 Please add these fields to your Users table in Airtable:');
        console.error('   1. reset_token (Single line text)');
        console.error('   2. reset_expires (Date with time)');
        throw new Error('Password reset requires database setup. Please add "reset_token" (Single line text) and "reset_expires" (Date) fields to your Users table in Airtable.');
      }
      console.error('❌ Error resetting password:', error.message);
      throw error;
    }
  }

  async checkPasswordResetFields() {
    try {
        
      const records = await this.usersTable.select({
        maxRecords: 1,
        fields: ['username', 'reset_token', 'reset_expires']
      }).firstPage();
      
      console.log('✅ Password reset fields are configured in Airtable');
      return true;
    } catch (error) {
      if (error.message && error.message.includes('Unknown field name')) {
        console.error('❌ Password reset fields missing from Airtable');
        console.error('📋 SETUP REQUIRED: Add these fields to your Users table:');
        console.error('   1. Field Name: reset_token');
        console.error('      Type: Single line text');
        console.error('   2. Field Name: reset_expires');
        console.error('      Type: Date');
        console.error('      ✓ Include a time field: Yes');
        console.error('');
        console.error('🔗 Instructions:');
        console.error('   1. Open your Airtable base');
        console.error('   2. Go to the Users table');
        console.error('   3. Click the + button to add new fields');
        console.error('   4. Create both fields as specified above');
        console.error('   5. Restart the server');
        return false;
      }
      console.error('❌ Error checking password reset fields:', error.message);
      return false;
    }
  }

  // MEETING MANAGEMENT METHODS

  // Create a new meeting
  async createMeeting(meetingData) {
    try {
      const { 
        meeting_code, 
        title, 
        created_by_user_id, 
        created_by_name, 
        is_anonymous,
        settings 
      } = meetingData;

      const meetingFields = {
        meeting_code: meeting_code,
        title: title || 'HangO Meeting',
        created_by_user_id: created_by_user_id || '',
        created_by_name: created_by_name || 'Anonymous',
        is_anonymous: is_anonymous || false,
        status: 'active',
        participants: JSON.stringify([]), // Start with empty participants
        settings: JSON.stringify(settings || {}),
        created_at: new Date().toISOString(),
        ended_at: ''
      };

      const records = await this.meetingsTable.create([{
        fields: meetingFields
      }]);

      const newMeeting = records[0];
      return {
        id: newMeeting.id,
        meeting_code: newMeeting.fields.meeting_code,
        title: newMeeting.fields.title,
        created_by_user_id: newMeeting.fields.created_by_user_id,
        created_by_name: newMeeting.fields.created_by_name,
        is_anonymous: newMeeting.fields.is_anonymous,
        status: newMeeting.fields.status,
        participants: JSON.parse(newMeeting.fields.participants || '[]'),
        settings: JSON.parse(newMeeting.fields.settings || '{}'),
        created_at: newMeeting.fields.created_at,
        ended_at: newMeeting.fields.ended_at
      };

    } catch (error) {
      console.error('❌ Error creating meeting:', error);
      throw error;
    }
  }

  // Find meeting by code
  async findMeetingByCode(meetingCode) {
    try {
      const records = await this.meetingsTable.select({
        filterByFormula: `{meeting_code} = '${meetingCode}'`,
        maxRecords: 1
      }).firstPage();

      if (records.length === 0) {
        return null;
      }

      const meeting = records[0];
      return {
        id: meeting.id,
        meeting_code: meeting.fields.meeting_code,
        title: meeting.fields.title,
        created_by_user_id: meeting.fields.created_by_user_id,
        created_by_name: meeting.fields.created_by_name,
        is_anonymous: meeting.fields.is_anonymous,
        status: meeting.fields.status,
        participants: JSON.parse(meeting.fields.participants || '[]'),
        settings: JSON.parse(meeting.fields.settings || '{}'),
        created_at: meeting.fields.created_at,
        ended_at: meeting.fields.ended_at
      };

    } catch (error) {
      console.error('❌ Error finding meeting:', error);
      return null;
    }
  }

  // Join a meeting
  async joinMeeting(meetingCode, participantData) {
    try {
      const meeting = await this.findMeetingByCode(meetingCode);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      if (meeting.status !== 'active') {
        throw new Error('Meeting is not active');
      }

      // Add participant to the meeting
      const participants = meeting.participants || [];
      const newParticipant = {
        user_id: participantData.user_id || '',
        name: participantData.name || 'Anonymous User',
        is_anonymous: participantData.is_anonymous !== false,
        joined_at: new Date().toISOString(),
        session_id: participantData.session_id || Math.random().toString(36).substr(2, 9) // Unique session ID
      };

      // For anonymous users, allow multiple with different session IDs
      // For authenticated users, check if already in meeting
      let existingIndex = -1;
      if (newParticipant.user_id && !newParticipant.is_anonymous) {
        existingIndex = participants.findIndex(p => 
          p.user_id && p.user_id === newParticipant.user_id
        );
      }

      if (existingIndex >= 0) {
        // Update existing authenticated user (rejoin scenario)
        participants[existingIndex] = newParticipant;
        console.log(`🔄 User ${newParticipant.name} rejoined meeting ${meetingCode}`);
      } else {
        // Add new participant (authenticated user first time, or any anonymous user)
        participants.push(newParticipant);
        console.log(`👋 Participant ${newParticipant.name} joined meeting ${meetingCode} (Total: ${participants.length})`);
      }

      // Update meeting with new participant list
      await this.meetingsTable.update([{
        id: meeting.id,
        fields: {
          participants: JSON.stringify(participants)
        }
      }]);

      return {
        ...meeting,
        participants: participants
      };

    } catch (error) {
      console.error('❌ Error joining meeting:', error);
      throw error;
    }
  }

  // Remove participant from meeting (when they leave)
  async leaveMeeting(meetingCode, participantData) {
    try {
      const meeting = await this.findMeetingByCode(meetingCode);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      let participants = meeting.participants || [];
      const originalCount = participants.length;

      // Remove participant by user_id (for authenticated users) or session_id (for anonymous)
      if (participantData.user_id && !participantData.is_anonymous) {
        participants = participants.filter(p => p.user_id !== participantData.user_id);
      } else if (participantData.session_id) {
        participants = participants.filter(p => p.session_id !== participantData.session_id);
      }

      const removedCount = originalCount - participants.length;
      if (removedCount > 0) {
        // Update meeting participants
        await this.meetingsTable.update([{
          id: meeting.id,
          fields: {
            participants: JSON.stringify(participants)
          }
        }]);

        console.log(`👋 Participant left meeting ${meetingCode} (Remaining: ${participants.length})`);

        // If no participants left, optionally auto-end the meeting
        if (participants.length === 0) {
          console.log(`🏁 No participants left in meeting ${meetingCode}, auto-ending meeting`);
          await this.endMeeting(meetingCode, 'system');
          return { ended: true, participants: [] };
        }
      }

      return {
        ...meeting,
        participants: participants
      };

    } catch (error) {
      console.error('❌ Error leaving meeting:', error);
      throw error;
    }
  }

  // End a meeting
  async endMeeting(meetingCode, endedByUserId = '') {
    try {
      const meeting = await this.findMeetingByCode(meetingCode);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      // Store meeting data for response before deletion
      const meetingData = {
        ...meeting,
        status: 'ended',
        ended_at: new Date().toISOString(),
        ended_by_user_id: endedByUserId
      };

      // Delete the meeting record from database
      await this.meetingsTable.destroy([meeting.id]);
      
      console.log(`🗑️ Meeting ${meetingCode} deleted from database after ending`);

      return meetingData;

    } catch (error) {
      console.error('❌ Error ending meeting:', error);
      throw error;
    }
  }

  // Get user's meetings
  async getUserMeetings(userId) {
    try {
      const records = await this.meetingsTable.select({
        filterByFormula: `{created_by_user_id} = '${userId}'`,
        sort: [{ field: 'created_at', direction: 'desc' }],
        maxRecords: 50
      }).firstPage();

      return records.map(meeting => ({
        id: meeting.id,
        meeting_code: meeting.fields.meeting_code,
        title: meeting.fields.title,
        status: meeting.fields.status,
        participants: JSON.parse(meeting.fields.participants || '[]'),
        created_at: meeting.fields.created_at,
        ended_at: meeting.fields.ended_at
      }));

    } catch (error) {
      console.error('❌ Error getting user meetings:', error);
      return [];
    }
  }

  // Update meeting participant count for user stats
  async updateUserMeetingStats(userId) {
    try {
      if (!userId) return;

      const meetings = await this.getUserMeetings(userId);
      const completedMeetings = meetings.filter(m => m.status === 'ended');

      // Update user's total_meetings count
      const user = await this.findUserById(userId);
      if (user) {
        await this.usersTable.update([{
          id: userId,
          fields: {
            total_meetings: completedMeetings.length
          }
        }]);
      }

    } catch (error) {
      console.error('❌ Error updating user meeting stats:', error);
    }
  }

  // Auto-cleanup: Delete meetings that have been active for more than 24 hours (abandoned meetings)
  async cleanupAbandonedMeetings() {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const records = await this.meetingsTable.select({
        filterByFormula: `AND({status} = 'active', {created_at} < '${twentyFourHoursAgo}')`,
        maxRecords: 100
      }).firstPage();

      if (records.length > 0) {
        const recordIds = records.map(record => record.id);
        await this.meetingsTable.destroy(recordIds);
        
        console.log(`🧹 Cleaned up ${records.length} abandoned meetings older than 24 hours`);
        return records.length;
      }
      
      return 0;
    } catch (error) {
      console.error('❌ Error cleaning up abandoned meetings:', error);
      return 0;
    }
  }

  // Auto-cleanup: Delete meetings with no participants for more than 1 hour
  async cleanupEmptyMeetings() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const records = await this.meetingsTable.select({
        filterByFormula: `AND({status} = 'active', {created_at} < '${oneHourAgo}')`,
        maxRecords: 100
      }).firstPage();

      const emptyMeetings = [];
      for (const record of records) {
        const participants = JSON.parse(record.fields.participants || '[]');
        if (participants.length === 0) {
          emptyMeetings.push(record.id);
        }
      }

      if (emptyMeetings.length > 0) {
        await this.meetingsTable.destroy(emptyMeetings);
        console.log(`🧹 Cleaned up ${emptyMeetings.length} empty meetings older than 1 hour`);
        return emptyMeetings.length;
      }
      
      return 0;
    } catch (error) {
      console.error('❌ Error cleaning up empty meetings:', error);
      return 0;
    }
  }

  // Update meeting participants in real-time
  async updateMeetingParticipants(meetingCode, participantsData) {
    try {
      const meeting = await this.findMeetingByCode(meetingCode);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      // Update participants in database
      await this.meetingsTable.update([{
        id: meeting.id,
        fields: {
          participants: JSON.stringify(participantsData),
          last_activity: new Date().toISOString()
        }
      }]);

      return true;
    } catch (error) {
      console.error('❌ Error updating meeting participants:', error);
      throw error;
    }
  }

  // Add chat message to meeting history
  async addChatMessage(meetingCode, messageData) {
    try {
      const meeting = await this.findMeetingByCode(meetingCode);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      // Get existing chat history
      let chatHistory = [];
      try {
        chatHistory = JSON.parse(meeting.chat_history || '[]');
      } catch (e) {
        chatHistory = [];
      }

      // Add new message
      chatHistory.push({
        id: messageData.id,
        message: messageData.message,
        sender: messageData.sender,
        timestamp: messageData.timestamp,
        isAnonymous: messageData.isAnonymous
      });

      // Keep only last 1000 messages
      if (chatHistory.length > 1000) {
        chatHistory = chatHistory.slice(-1000);
      }

      // Update in database
      await this.meetingsTable.update([{
        id: meeting.id,
        fields: {
          chat_history: JSON.stringify(chatHistory),
          last_activity: new Date().toISOString()
        }
      }]);

      return chatHistory;
    } catch (error) {
      console.error('❌ Error adding chat message:', error);
      throw error;
    }
  }

  // Get meeting analytics
  async getMeetingAnalytics(meetingCode) {
    try {
      const meeting = await this.findMeetingByCode(meetingCode);
      if (!meeting) {
        return null;
      }

      const participants = JSON.parse(meeting.participants || '[]');
      const chatHistory = JSON.parse(meeting.chat_history || '[]');
      
      const analytics = {
        meetingCode: meeting.meeting_code,
        title: meeting.title,
        createdAt: meeting.created_at,
        duration: meeting.ended_at ? 
          new Date(meeting.ended_at).getTime() - new Date(meeting.created_at).getTime() : 
          Date.now() - new Date(meeting.created_at).getTime(),
        totalParticipants: participants.length,
        totalMessages: chatHistory.length,
        isActive: meeting.status === 'active',
        lastActivity: meeting.last_activity || meeting.created_at
      };

      return analytics;
    } catch (error) {
      console.error('❌ Error getting meeting analytics:', error);
      return null;
    }
  }

  // Get all active meetings
  async getActiveMeetings() {
    try {
      const records = await this.meetingsTable.select({
        filterByFormula: `{status} = 'active'`,
        fields: ['meeting_code', 'title', 'created_at', 'participants', 'last_activity']
      }).all();

      return records.map(record => ({
        id: record.id,
        meeting_code: record.fields.meeting_code,
        title: record.fields.title,
        created_at: record.fields.created_at,
        participant_count: JSON.parse(record.fields.participants || '[]').length,
        last_activity: record.fields.last_activity || record.fields.created_at
      }));
    } catch (error) {
      console.error('❌ Error getting active meetings:', error);
      return [];
    }
  }

}

module.exports = AirtableService;