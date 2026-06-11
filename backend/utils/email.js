const nodemailer = require('nodemailer');
const logger = require('./logger');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

const emailTemplates = {
  verifyEmail: (name, verificationUrl) => ({
    subject: 'Verify your ConnectPro email address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #0000ff; text-align: center;">ConnectPro</h1>
        <h2>Hi ${name}!</h2>
        <p>Thanks for signing up! Please verify your email address to complete your registration.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background: #0000ff; color: white; padding: 15px 30px; border-radius: 25px; text-decoration: none; font-size: 16px;">
            Verify Email
          </a>
        </div>
        <p style="color: #666; font-size: 12px;">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
        <p style="color: #666; font-size: 12px;">Or copy this link: ${verificationUrl}</p>
      </div>
    `,
  }),

  resetPassword: (name, resetUrl) => ({
    subject: 'ConnectPro Password Reset',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #0000ff; text-align: center;">ConnectPro</h1>
        <h2>Hi ${name}!</h2>
        <p>You requested a password reset. Click the button below to reset your password.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #0000ff; color: white; padding: 15px 30px; border-radius: 25px; text-decoration: none; font-size: 16px;">
            Reset Password
          </a>
        </div>
        <p style="color: #666; font-size: 12px;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
        <p style="color: #666; font-size: 12px;">Or copy this link: ${resetUrl}</p>
      </div>
    `,
  }),

  welcomeEmail: (name) => ({
    subject: 'Welcome to ConnectPro! 🎉',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #0000ff; text-align: center;">Welcome to ConnectPro!</h1>
        <h2>Hi ${name}! 👋</h2>
        <p>Your account is verified and ready to go. Start connecting with friends and sharing your moments!</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.CLIENT_URL}" style="background: #0000ff; color: white; padding: 15px 30px; border-radius: 25px; text-decoration: none; font-size: 16px;">
            Go to ConnectPro
          </a>
        </div>
      </div>
    `,
  }),

  accountDeletion: (name) => ({
    subject: 'ConnectPro Account Deletion Confirmation',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #0000ff; text-align: center;">ConnectPro</h1>
        <h2>Hi ${name},</h2>
        <p>Your ConnectPro account has been successfully deleted. We're sorry to see you go.</p>
        <p>All your data has been removed from our systems. If this was a mistake, please contact our support team immediately.</p>
      </div>
    `,
  }),
};

const sendEmail = async ({ to, subject, html }) => {
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    logger.info(`Email sent: ${info.messageId} to ${to}`);
    return info;
  } catch (err) {
    logger.error(`Email send failed to ${to}: ${err.message}`);
    throw err;
  }
};

const sendVerificationEmail = async (user, token) => {
  const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${token}`;
  const template = emailTemplates.verifyEmail(user.name, verificationUrl);
  await sendEmail({ to: user.email, ...template });
};

const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${token}`;
  const template = emailTemplates.resetPassword(user.name, resetUrl);
  await sendEmail({ to: user.email, ...template });
};

const sendWelcomeEmail = async (user) => {
  const template = emailTemplates.welcomeEmail(user.name);
  await sendEmail({ to: user.email, ...template });
};

const sendAccountDeletionEmail = async (user) => {
  const template = emailTemplates.accountDeletion(user.name);
  await sendEmail({ to: user.email, ...template });
};

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendAccountDeletionEmail,
};
