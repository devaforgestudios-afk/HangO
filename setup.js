#!/usr/bin/env node

/**
 * HangO Setup Script
 * Helps configure the environment for WebRTC meeting functionality
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupEnvironment() {
  console.log('🎯 HangO WebRTC Setup');
  console.log('=====================\n');

  // Check if .env already exists
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const overwrite = await question('⚠️  .env file already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }

  console.log('Let\'s configure your HangO environment:\n');

  // Domain configuration
  const domain = await question('🌐 Enter your domain (default: http://localhost:3000): ') || 'http://localhost:3000';
  
  // Port configuration
  const port = await question('🔌 Enter port number (default: 3000): ') || '3000';
  
  // Session secret
  const sessionSecret = await question('🔐 Enter session secret (or press Enter for random): ') || generateRandomSecret();
  
  // Email configuration
  console.log('\n📧 Email Configuration (optional - for user verification):');
  const useEmail = await question('Configure email? (y/N): ');
  
  let emailConfig = '';
  if (useEmail.toLowerCase() === 'y') {
    const smtpHost = await question('SMTP Host (e.g., smtp.gmail.com): ');
    const smtpPort = await question('SMTP Port (default: 587): ') || '587';
    const smtpUser = await question('SMTP Username/Email: ');
    const smtpPass = await question('SMTP Password/App Password: ');
    const smtpFrom = await question('From Email Address: ') || smtpUser;
    
    emailConfig = `
# Email Configuration
SMTP_HOST=${smtpHost}
SMTP_PORT=${smtpPort}
SMTP_SECURE=false
SMTP_USER=${smtpUser}
SMTP_PASS=${smtpPass}
SMTP_FROM=${smtpFrom}`;
  }
  
  // Airtable configuration
  console.log('\n📊 Database Configuration (optional - uses in-memory storage by default):');
  const useAirtable = await question('Configure Airtable? (y/N): ');
  
  let airtableConfig = '';
  if (useAirtable.toLowerCase() === 'y') {
    const airtableKey = await question('Airtable API Key: ');
    const airtableBase = await question('Airtable Base ID: ');
    
    airtableConfig = `
# Airtable Configuration  
AIRTABLE_API_KEY=${airtableKey}
AIRTABLE_BASE_ID=${airtableBase}`;
  }

  // Generate .env file
  const envContent = `# HangO Environment Configuration
# Generated on ${new Date().toISOString()}

# Server Configuration
PORT=${port}
NODE_ENV=development
DOMAIN=${domain}

# Session Configuration
SESSION_SECRET=${sessionSecret}${emailConfig}${airtableConfig}

# OAuth Configuration (Optional)
# GOOGLE_CLIENT_ID=your-google-client-id
# GOOGLE_CLIENT_SECRET=your-google-client-secret
# GITHUB_CLIENT_ID=your-github-client-id  
# GITHUB_CLIENT_SECRET=your-github-client-secret

# TURN Server Configuration (Optional - for better WebRTC connectivity)
# TURN_SERVER_URL=turn:your-turn-server.com:3478
# TURN_USERNAME=your-turn-username
# TURN_CREDENTIAL=your-turn-password
`;

  fs.writeFileSync(envPath, envContent);
  
  console.log('\n✅ Environment configuration saved to .env');
  console.log('\n🚀 Setup complete! To start HangO:');
  console.log('   npm install');
  console.log('   npm start');
  console.log('\n📖 For more information, see WEBRTC_IMPLEMENTATION_GUIDE.md');
  
  rl.close();
}

function generateRandomSecret() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Run setup if called directly
if (require.main === module) {
  setupEnvironment().catch(console.error);
}

module.exports = { setupEnvironment };