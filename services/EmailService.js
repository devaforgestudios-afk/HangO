const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendVerificationEmail(to, username, verificationUrl) {
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@hango.com',
    to,
    subject: 'Verify your HangO account',
    html: `<h2>Welcome to HangO, ${username}!</h2>
      <p>Click the link below to verify your account:</p>
      <a href="${verificationUrl}">${verificationUrl}</a>
      <p>If you did not sign up, you can ignore this email.</p>`
  };
  await transporter.sendMail(mailOptions);
}

async function sendWelcomeEmail(to, username, provider) {
  const providerName = provider === 'github' ? 'GitHub' : provider === 'google' ? 'Google' : 'OAuth';
  
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@hango.com',
    to,
    subject: 'Welcome to HangO! Account Created Successfully',
    html: `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="background: linear-gradient(135deg, #22d3ee 0%, #a78bfa 50%, #f472b6 100%); padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 2.5em; font-weight: bold;">🎉 Welcome to HangO!</h1>
        </div>
        
        <div style="padding: 40px 30px; background: #f9fafb; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937; margin-bottom: 20px;">Hi ${username}! 👋</h2>
          
          <p style="font-size: 18px; margin-bottom: 25px;">
            Your account has been <strong>successfully created</strong> using ${providerName}! 
            You're now part of the HangO community where meaningful connections happen.
          </p>
          
          <div style="background: white; padding: 25px; border-radius: 8px; border-left: 4px solid #22d3ee; margin: 25px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">🚀 What's Next?</h3>
            <ul style="margin: 15px 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;">Complete your profile setup</li>
              <li style="margin-bottom: 8px;">Start creating or joining meetings</li>
              <li style="margin-bottom: 8px;">Connect with amazing people worldwide</li>
              <li style="margin-bottom: 8px;">Explore HangO's collaborative features</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/dashboard.html" 
               style="background: linear-gradient(135deg, #22d3ee, #a78bfa); 
                      color: white; 
                      text-decoration: none; 
                      padding: 15px 30px; 
                      border-radius: 25px; 
                      font-weight: bold; 
                      display: inline-block; 
                      box-shadow: 0 4px 15px rgba(34, 211, 238, 0.3);">
              🎯 Go to Dashboard
            </a>
          </div>
          
          <div style="background: #e5f3ff; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #b3d9ff;">
            <p style="margin: 0; font-size: 14px; color: #1f2937;">
              <strong>Account Details:</strong><br>
              📧 Email: ${to}<br>
              👤 Username: ${username}<br>
              🔐 Sign-in Method: ${providerName}<br>
              📅 Account Created: ${new Date().toLocaleString()}
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="font-size: 14px; color: #6b7280; text-align: center; margin: 0;">
            Need help? Reply to this email or visit our 
            <a href="http://localhost:3000" style="color: #22d3ee;">support center</a>.
          </p>
          
          <p style="font-size: 14px; color: #6b7280; text-align: center; margin: 10px 0 0 0;">
            Happy hanging! 🌟<br>
            <strong>The HangO Team</strong>
          </p>
        </div>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
}

module.exports = { sendVerificationEmail, sendWelcomeEmail };
