const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

// Create email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Email templates
const emailTemplates = {
  vendorRegistration: {
    subject: 'Welcome to Vendor Management System',
    template: (vendorName) => ({
      subject: 'Welcome to Vendor Management System',
      html: `
        <h1>Welcome ${vendorName}!</h1>
        <p>Thank you for registering with our Vendor Management System.</p>
        <p>Your account has been created successfully.</p>
      `
    })
  },
  contractRenewal: {
    subject: 'Contract Renewal Notice',
    template: (contractDetails) => ({
      subject: 'Contract Renewal Notice',
      html: `
        <h1>Contract Renewal Required</h1>
        <p>Your contract #${contractDetails.contractId} is due for renewal.</p>
        <p>Expiration Date: ${contractDetails.expirationDate}</p>
      `
    })
  },
  purchaseOrderNotification: {
    subject: 'New Purchase Order',
    template: (poDetails) => ({
      subject: 'New Purchase Order',
      html: `
        <h1>New Purchase Order Created</h1>
        <p>Purchase Order #${poDetails.poNumber} has been created.</p>
        <p>Total Amount: ${poDetails.amount}</p>
      `
    })
  }
};

// Send email function
const sendEmail = async (options) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
  emailTemplates,
  transporter
};