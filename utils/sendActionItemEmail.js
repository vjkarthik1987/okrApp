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

let emailQueue = [];
let isProcessing = false;
const delayBetweenEmails = 750; // in milliseconds
const maxRetries = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (emailQueue.length > 0) {
    const { mailOptions, assignedToUser, retryCount = 0 } = emailQueue.shift();

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${assignedToUser.email}`);
    } catch (err) {
      const isRateLimit = err.message.includes('Concurrent connections limit exceeded');
      console.error(`❌ Email failed to ${assignedToUser.email}: ${err.message}`);

      if (isRateLimit && retryCount < maxRetries) {
        console.log(`🔁 Retrying ${assignedToUser.email} (${retryCount + 1})...`);
        emailQueue.push({ mailOptions, assignedToUser, retryCount: retryCount + 1 });
      }
    }

    await sleep(delayBetweenEmails);
  }

  isProcessing = false;
}

async function sendActionItemNotification({ actionItem, assignedToUser, createdByUser }) {
  if (!assignedToUser?.email) return;

  const mailOptions = {
    from: `"OKR System" <${process.env.OFFICE_365_EMAIL}>`,
    to: assignedToUser.email, // or use a test email like 'karthikvj@suntecsbs.com'
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

  emailQueue.push({ mailOptions, assignedToUser });
  processQueue(); // trigger queue processor (if not already running)
}

module.exports = sendActionItemNotification;
