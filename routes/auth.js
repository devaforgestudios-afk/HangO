const express = require('express');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AirtableService = require('../services/AirtableService');
const { sendWelcomeEmail } = require('../services/EmailService');

const router = express.Router();
const airtable = new AirtableService();

// Passport GitHub Strategy
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/auth/github/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('🔍 GitHub OAuth callback received for user:', profile.username);
    
    // Check if user already exists by GitHub ID
    let user = await airtable.findUserByProvider('github', profile.id);
    
    if (user) {
      console.log('✅ Existing GitHub user found:', user.username);
      return done(null, user);
    }
    
    // Create new user with email duplicate checking
    const userData = {
      username: profile.username || profile.displayName?.replace(/\s+/g, '').toLowerCase() || `github_${profile.id}`,
      full_name: profile.displayName || profile.username,
      email: profile.emails?.[0]?.value || '',
      avatar_url: profile.photos?.[0]?.value || '',
      provider: 'github',
      provider_id: profile.id.toString(),
      is_verified: true // OAuth users are automatically verified
    };
    
    try {
      user = await airtable.createOAuthUser(userData);
      console.log('✅ New GitHub user created:', user.username);
      
      // Send welcome email for new users
      if (user.email) {
        try {
          await sendWelcomeEmail(user.email, user.username, 'github');
          console.log('📧 Welcome email sent to:', user.email);
        } catch (emailError) {
          console.error('📧 Failed to send welcome email:', emailError.message);
          // Continue with authentication even if email fails
        }
      }
      
      return done(null, user);
      
    } catch (createError) {
      console.error('❌ Failed to create GitHub user:', createError.message);
      
      // Check error type for specific redirects
      if (createError.message.includes('Username') && createError.message.includes('already taken')) {
        return done(null, false, { message: 'username_taken' });
      }
      if (createError.message.includes('email') && createError.message.includes('already exists')) {
        return done(null, false, { message: 'email_exists' });
      }
      
      // Generic error
      return done(null, false, { message: createError.message });
    }
  } catch (error) {
    console.error('❌ GitHub OAuth error:', error);
    return done(error, null);
  }
}));

// Passport Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('🔍 Google OAuth callback received for user:', profile.emails[0].value);
    
    // Check if user already exists by Google ID
    let user = await airtable.findUserByProvider('google', profile.id);
    
    if (user) {
      console.log('✅ Existing Google user found:', user.username);
      return done(null, user);
    }
    
    // Create new user with email duplicate checking
    const userData = {
      username: profile.emails[0].value.split('@')[0], // Use email prefix as username
      full_name: profile.displayName,
      email: profile.emails[0].value,
      avatar_url: profile.photos?.[0]?.value || '',
      provider: 'google',
      provider_id: profile.id,
      is_verified: true // OAuth users are automatically verified
    };
    
    try {
      user = await airtable.createOAuthUser(userData);
      console.log('✅ New Google user created:', user.username);
      
      // Send welcome email for new users
      if (user.email) {
        try {
          await sendWelcomeEmail(user.email, user.username, 'google');
          console.log('📧 Welcome email sent to:', user.email);
        } catch (emailError) {
          console.error('📧 Failed to send welcome email:', emailError.message);
          // Continue with authentication even if email fails
        }
      }
      
      return done(null, user);
      
    } catch (createError) {
      console.error('❌ Failed to create Google user:', createError.message);
      
      // Check error type for specific redirects
      if (createError.message.includes('Username') && createError.message.includes('already taken')) {
        return done(null, false, { message: 'username_taken' });
      }
      if (createError.message.includes('email') && createError.message.includes('already exists')) {
        return done(null, false, { message: 'email_exists' });
      }
      
      // Generic error
      return done(null, false, { message: createError.message });
    }
  } catch (error) {
    console.error('❌ Google OAuth error:', error);
    return done(error, null);
  }
}));

// Serialize/Deserialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await airtable.findUserById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// OAuth Routes
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback', 
  (req, res, next) => {
    passport.authenticate('github', (err, user, info) => {
      if (err) {
        console.error('GitHub OAuth error:', err);
        return res.redirect('/auth.html?error=github_failed');
      }
      
      if (!user) {
        console.log('GitHub authentication failed:', info?.message);
        
        // Handle specific error types
        if (info?.message === 'username_taken') {
          return res.redirect('/auth.html?error=username_taken');
        }
        if (info?.message === 'email_exists') {
          return res.redirect('/auth.html?error=email_exists');
        }
        
        return res.redirect('/auth.html?error=github_failed');
      }
      
      // Login the user
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.redirect('/auth.html?error=github_failed');
        }
        
        console.log('✅ GitHub authentication successful, redirecting to dashboard');
        return res.redirect('/dashboard.html');
      });
    })(req, res, next);
  }
);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
      if (err) {
        console.error('Google OAuth error:', err);
        return res.redirect('/auth.html?error=google_failed');
      }
      
      if (!user) {
        console.log('Google authentication failed:', info?.message);
        
        // Handle specific error types
        if (info?.message === 'username_taken') {
          return res.redirect('/auth.html?error=username_taken');
        }
        if (info?.message === 'email_exists') {
          return res.redirect('/auth.html?error=email_exists');
        }
        
        return res.redirect('/auth.html?error=google_failed');
      }
      
      // Login the user
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.redirect('/auth.html?error=google_failed');
        }
        
        console.log('✅ Google authentication successful, redirecting to dashboard');
        return res.redirect('/dashboard.html');
      });
    })(req, res, next);
  }
);

// Logout route
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('❌ Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    console.log('✅ User logged out successfully');
    res.json({ success: true });
  });
});

// Auth status check
router.get('/status', (req, res) => {
  if (req.isAuthenticated()) {
    const { password_hash, verification_token, ...userWithoutSensitiveData } = req.user;
    res.json({ 
      authenticated: true, 
      user: userWithoutSensitiveData
    });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;