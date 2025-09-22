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
    const { fullName, username, email, phone, password, avatar } = userData;
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
            avatar: avatar || '',
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
        avatar: newUser.fields.avatar,
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
        avatar_url: user.fields.avatar_url || user.fields.avatar,
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
        return user;
      }

      // Check if email already exists with ANY provider
      if (email) {
        const existingUserByEmail = await this.findUserByEmail(email);
        if (existingUserByEmail) {
          console.log(`⚠️ Email ${email} already exists with provider: ${existingUserByEmail.provider}`);
          
          // If it's the same provider, this shouldn't happen (caught above)
          // If it's a different provider, we have options:
          
          if (existingUserByEmail.provider === 'email') {
            // User signed up with email/password, now trying OAuth
            throw new Error(`An account with email ${email} already exists. Please log in using your email and password, or use the "Link Account" feature to connect your ${provider} account.`);
          } else if (existingUserByEmail.provider !== provider) {
            // User has OAuth account with different provider
            throw new Error(`An account with email ${email} already exists using ${existingUserByEmail.provider}. Please log in with ${existingUserByEmail.provider} or use a different email address.`);
          }
        }
      }

      // Check for username conflicts
      const existingUserByUsername = await this.findUserByUsername(username);
      
      if (existingUserByUsername) {
        // Throw error for username conflicts instead of auto-generating
        throw new Error(`Username '${username}' is already taken. Please try signing up with a different ${provider} account or contact support if this is your account.`);
      }

      // Create OAuth user record - only use fields that exist in Airtable
      const userFields = {
        full_name: full_name || username,
        username: username,
        email: email || '',
        phone: phone || '', // Will be collected during profile completion
        is_verified: is_verified || true,
        password_hash: '', // OAuth users don't have passwords
        verification_token: '',
        created_at: new Date().toISOString()
        // Note: profile_completed field can be added to Airtable if needed
      };

      // Add optional OAuth fields only if they exist in your Airtable schema
      // You can uncomment these lines after adding the fields to Airtable
      // if (avatar_url) userFields.avatar_url = avatar_url;
      // if (provider) userFields.provider = provider;
      // if (provider_id) userFields.provider_id = provider_id.toString();

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
        avatar_url: avatar_url || '', // Store in memory for session
        provider: provider || 'oauth',
        provider_id: provider_id || '',
        is_verified: newUser.fields.is_verified,
        created_at: newUser.fields.created_at
      };

      console.log(`✅ New ${provider} user created:`, createdUser.username);
      return createdUser;

    } catch (error) {
      console.error('Airtable create OAuth user error:', error);
      throw error;
    }
  }

  // Find user by OAuth provider (simplified for now)
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
        avatar_url: record.fields.avatar_url || record.fields.avatar,
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
        password_hash: user.fields.password_hash,
        avatar: user.fields.avatar,
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
        avatar: record.fields.avatar,
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
        console.error('📝 Required fields: username, email, phone, full_name, password_hash');
      }
      return false;
    }
  }

  // Generate password reset token
  async generatePasswordResetToken(email) {
    try {
      // First check if user exists
      const existingUser = await this.findUserByEmail(email);
      if (!existingUser) {
        console.log('❌ Password reset attempted for non-existent email:', email);
        throw new Error('No account found with this email address. Please check your email or create a new account.');
      }

      // Generate secure reset token (random 32 bytes as hex)
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      try {
        // Update the user record with reset token and expiration
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

  // Verify password reset token
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

  // Reset user password with token
  async resetPasswordWithToken(token, newPassword) {
    try {
      // Verify the token first
      const user = await this.verifyPasswordResetToken(token);
      
      // Hash the new password properly using bcrypt
      const bcrypt = require('bcryptjs');
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      console.log('🔐 Updating password hash for user:', user.email);

      // Update the user with new hashed password and clear reset fields
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

  // Check if password reset fields exist in Airtable
  async checkPasswordResetFields() {
    try {
      // Try to select with the required fields to see if they exist
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
}

module.exports = AirtableService;