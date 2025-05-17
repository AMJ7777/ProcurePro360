const nodemailer = require('nodemailer');
const { logger } = require('./logger');
const path = require('path');
const fs = require('fs').promises;
const handlebars = require('handlebars');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // Email templates cache
    this.templates = {};
  }

  // Load and cache email template
  async loadTemplate(templateName) {
    if (this.templates[templateName]) {
      return this.templates[templateName];
    }

    const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    this.templates[templateName] = handlebars.compile(templateContent);
    return this.templates[templateName];
  }

  // Send email using template
  async sendTemplateEmail(options) {
    try {
      const template = await this.loadTemplate(options.template);
      const html = template(options.data);

      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        html
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully', { messageId: info.messageId });
      return info;
    } catch (error) {
      logger.error('Email sending failed:', error);
      throw error;
    }
  }

  // Predefined email templates
  async sendWelcomeEmail(user) {
    await this.sendTemplateEmail({
      template: 'welcome',
      to: user.email,
      subject: 'Welcome to Vendor Management System',
      data: {
        name: user.username,
        loginUrl: process.env.APP_URL + '/login'
      }
    });
  }

  async sendContractRenewalNotification(contract, vendor) {
    await this.sendTemplateEmail({
      template: 'contractRenewal',
      to: vendor.email,
      subject: 'Contract Renewal Notification',
      data: {
        vendorName: vendor.company_name,
        contractNumber: contract.contract_number,
        expiryDate: contract.end_date,
        renewalUrl: `${process.env.APP_URL}/contracts/${contract.id}/renew`
      }
    });
  }

  async sendPurchaseOrderNotification(po, vendor) {
    await this.sendTemplateEmail({
      template: 'purchaseOrder',
      to: vendor.email,
      subject: `New Purchase Order ${po.po_number}`,
      data: {
        vendorName: vendor.company_name,
        poNumber: po.po_number,
        totalAmount: po.total_amount,
        deliveryDate: po.delivery_date,
        poUrl: `${process.env.APP_URL}/purchase-orders/${po.id}`
      }
    });
  }

  async sendVendorApprovalNotification(vendor) {
    await this.sendTemplateEmail({
      template: 'vendorApproval',
      to: vendor.email,
      subject: 'Vendor Registration Approved',
      data: {
        companyName: vendor.company_name,
        dashboardUrl: `${process.env.APP_URL}/vendor/dashboard`
      }
    });
  }

  // Email queue handling
  async addToEmailQueue(emailData) {
    // Implementation for queueing emails (e.g., using Redis or Bull)
  }

  // Bulk email sending
  async sendBulkEmails(recipients, templateName, data) {
    const promises = recipients.map(recipient => 
      this.sendTemplateEmail({
        template: templateName,
        to: recipient.email,
        subject: data.subject,
        data: { ...data, recipientName: recipient.name }
      })
    );

    return Promise.all(promises);
  }
}

module.exports = new EmailService();