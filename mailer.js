const nodemailer = require('nodemailer');

// Configure transporter using your email credentials
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Send SOS alert with reportee's name
const sendSOSAlert = (toEmail, userName, message, area) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: `🚨 ${userName} reported an incident`,
    text: `${userName} reported an emergency in the area: ${area}\n\nMessage: ${message}`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error('❌ Email failed:', err);
    } else {
      console.log('✅ Email sent:', info.response);
    }
  });
};

module.exports = sendSOSAlert;
