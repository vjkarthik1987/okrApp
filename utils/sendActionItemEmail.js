const nodemailer = require('nodemailer');
const User = require('../models/User');

const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.OFFICE_365_EMAIL,
    pass: process.env.OFFICE_365_PASSWORD
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false
  }
});

async function sendActionItemNotification({ actionItem, assignedToUser, createdByUser }) {
  if (!assignedToUser?.email) return;

  const mailOptions = {
    from: `"OKR System" <${process.env.OFFICE_365_EMAIL}>`,
    to: 'karthikvj@suntecsbs.com', //to: assignedToUser.email,
    subject: `📝 New Action Item Assigned: ${actionItem.title}`,
    html: `
      <p>Hi ${assignedToUser.name},</p>
      <p>A new action item has been created and assigned to you:</p>
      <ul>
        <li><strong>📌 Title:</strong> ${actionItem.title}</li>
        ${actionItem.dueDate ? `<li><strong>🗓️ Due Date:</strong> ${new Date(actionItem.dueDate).toDateString()}</li>` : ''}
        ${actionItem.meeting ? `<li><strong>💬 Meeting:</strong> ${actionItem.meeting}</li>` : ''}
        <li><strong>📥 Added by:</strong> ${createdByUser.name}</li>
      </ul>
      <p>You can view and update it from your OKR dashboard.</p>
      <p>Thanks,<br/>OKR Tracker</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error(`❌ Email failed to ${assignedToUser.email}:`, err.message);
  }
}

module.exports = sendActionItemNotification;
