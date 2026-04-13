const nodemailer = require('nodemailer');

const mailUser = process.env.GMAIL_USER;
const mailPass = process.env.GMAIL_APP_PASSWORD;

const ensureEmailCredentials = () => {
  if (!mailUser || !mailPass) {
    throw new Error(
      'Missing email credentials. Set GMAIL_USER and GMAIL_APP_PASSWORD in Server/.env.'
    );
  }
};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: mailUser,
    pass: mailPass,
  },
});

const FROM_EMAIL = mailUser;

/**
 * Send OTP verification code via email.
 */
const sendOtpEmail = async (toEmail, code) => {
  ensureEmailCredentials();

  const mailOptions = {
    from: `"Shafiq Cards" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: `Your Verification Code — Shafiq Cards`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0b; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2c;">
        <div style="background: linear-gradient(135deg, #c59d5f, #b8863f); padding: 32px 24px; text-align: center;">
          <h1 style="margin: 0; color: #fff; font-size: 22px; letter-spacing: 0.05em;">Shafiq Cards</h1>
          <p style="margin: 6px 0 0; color: rgba(255,255,255,0.85); font-size: 13px;">Web Invitation Verification</p>
        </div>
        <div style="padding: 36px 32px; text-align: center;">
          <p style="color: #ccc; font-size: 15px; margin: 0 0 24px; line-height: 1.6;">
            Use the code below to verify your email and publish your wedding invitation website.
          </p>
          <div style="display: inline-block; background: rgba(197,157,95,0.1); border: 2px dashed #c59d5f; border-radius: 12px; padding: 18px 40px; letter-spacing: 0.5em; font-size: 32px; font-weight: 700; color: #c59d5f;">
            ${code}
          </div>
          <p style="color: #888; font-size: 13px; margin: 24px 0 0; line-height: 1.5;">
            This code expires in <strong>10 minutes</strong>.<br>If you didn't request this, you can safely ignore this email.
          </p>
        </div>
        <div style="background: #111; padding: 16px 24px; text-align: center;">
          <p style="color: #555; font-size: 11px; margin: 0;">© Shafiq Cards · Premium Wedding Stationery</p>
        </div>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
  console.log('✅ OTP email sent to:', toEmail);
};

/**
 * Send notification email when the invitation goes live.
 */
const sendVerificationEmail = async (toEmail, coupleNames, inviteUrl) => {
  ensureEmailCredentials();

  try {
    const mailOptions = {
      from: `"Shafiq Cards" <${FROM_EMAIL}>`,
      to: toEmail,
      subject: `Your Web Invitation is Live! — Shafiq Cards`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0b; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2c;">
          <div style="background: linear-gradient(135deg, #c59d5f, #b8863f); padding: 32px 24px; text-align: center;">
            <h1 style="margin: 0; color: #fff; font-size: 22px; letter-spacing: 0.05em;">Congratulations! 🎉</h1>
          </div>
          <div style="padding: 36px 32px;">
            <p style="color: #ccc; font-size: 15px; margin: 0 0 20px; line-height: 1.7;">
              Dear <strong>${coupleNames}</strong>,<br><br>
              Your web invitation is now <strong>live</strong> and ready to share with your guests!
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #c59d5f, #b8863f); color: #fff; padding: 14px 36px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 14px; letter-spacing: 0.05em;">
                View Your Invitation →
              </a>
            </div>
            <p style="color: #888; font-size: 13px; line-height: 1.5;">
              Share the link above with friends and family. Guest RSVPs will be emailed to you directly.
            </p>
          </div>
          <div style="background: #111; padding: 16px 24px; text-align: center;">
            <p style="color: #555; font-size: 11px; margin: 0;">© Shafiq Cards · Premium Wedding Stationery</p>
          </div>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent to:', toEmail);
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
  }
};

/**
 * Send RSVP notification email to the invitation owner.
 */
const sendRSVPEmail = async (toEmail, coupleNames, rsvpData) => {
  ensureEmailCredentials();

  try {
    const mailOptions = {
      from: `"Shafiq Cards" <${FROM_EMAIL}>`,
      to: toEmail,
      subject: `New RSVP Received! — ${coupleNames}'s Wedding`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0b; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2c;">
          <div style="background: linear-gradient(135deg, #c59d5f, #b8863f); padding: 24px; text-align: center;">
            <h1 style="margin: 0; color: #fff; font-size: 20px;">💌 New RSVP Received!</h1>
          </div>
          <div style="padding: 32px;">
            <p style="color: #ccc; font-size: 15px; margin: 0 0 20px;">
              Hello <strong>${coupleNames}</strong>, a guest has responded to your wedding invitation!
            </p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="color: #888; padding: 8px 0; border-bottom: 1px solid #222; width: 120px;">Name</td><td style="color: #fff; padding: 8px 0; border-bottom: 1px solid #222; font-weight: 600;">${rsvpData.name}</td></tr>
              ${rsvpData.email ? `<tr><td style="color: #888; padding: 8px 0; border-bottom: 1px solid #222;">Email</td><td style="color: #fff; padding: 8px 0; border-bottom: 1px solid #222;">${rsvpData.email}</td></tr>` : ''}
              ${rsvpData.familyName ? `<tr><td style="color: #888; padding: 8px 0; border-bottom: 1px solid #222;">Family</td><td style="color: #fff; padding: 8px 0; border-bottom: 1px solid #222;">${rsvpData.familyName}</td></tr>` : ''}
              <tr><td style="color: #888; padding: 8px 0; border-bottom: 1px solid #222;">Side</td><td style="color: #fff; padding: 8px 0; border-bottom: 1px solid #222;">${rsvpData.side === 'groom' ? "Groom's Side" : "Bride's Side"}</td></tr>
              ${rsvpData.whatsappNumber ? `<tr><td style="color: #888; padding: 8px 0; border-bottom: 1px solid #222;">WhatsApp</td><td style="color: #fff; padding: 8px 0; border-bottom: 1px solid #222;"><a href="https://wa.me/${rsvpData.whatsappNumber.replace(/\\D/g, '')}" style="color: #c59d5f;">${rsvpData.whatsappNumber}</a></td></tr>` : ''}
              ${rsvpData.message ? `<tr><td style="color: #888; padding: 8px 0;">Message</td><td style="color: #eee; padding: 8px 0; font-style: italic;">"${rsvpData.message}"</td></tr>` : ''}
            </table>
          </div>
          <div style="background: #111; padding: 16px 24px; text-align: center;">
            <p style="color: #555; font-size: 11px; margin: 0;">© Shafiq Cards · Premium Wedding Stationery</p>
          </div>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    console.log('✅ RSVP email sent to:', toEmail);
  } catch (error) {
    console.error('❌ Error sending RSVP email:', error);
  }
};

/**
 * Send password reset code via email.
 */
const sendResetCodeEmail = async (toEmail, resetCode, brideName, groomName) => {
  ensureEmailCredentials();

  const mailOptions = {
    from: `"Shafiq Cards" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: `Password Reset Code — Shafiq Cards`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0b; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2c;">
        <div style="background: linear-gradient(135deg, #c59d5f, #b8863f); padding: 32px 24px; text-align: center;">
          <h1 style="margin: 0; color: #fff; font-size: 22px; letter-spacing: 0.05em;">Shafiq Cards</h1>
          <p style="margin: 6px 0 0; color: rgba(255,255,255,0.85); font-size: 13px;">Password Reset</p>
        </div>
        <div style="padding: 36px 32px; text-align: center;">
          <p style="color: #ccc; font-size: 15px; margin: 0 0 24px; line-height: 1.6;">
            Hello <strong>${brideName} & ${groomName}</strong>,<br><br>
            Use the code below to reset your password for your wedding invitation website.
          </p>
          <div style="display: inline-block; background: rgba(197,157,95,0.1); border: 2px dashed #c59d5f; border-radius: 12px; padding: 18px 40px; letter-spacing: 0.5em; font-size: 32px; font-weight: 700; color: #c59d5f;">
            ${resetCode}
          </div>
          <p style="color: #888; font-size: 13px; margin: 24px 0 0; line-height: 1.5;">
            This code expires in <strong>15 minutes</strong>.<br>If you didn't request this, you can safely ignore this email.
          </p>
        </div>
        <div style="background: #111; padding: 16px 24px; text-align: center;">
          <p style="color: #555; font-size: 11px; margin: 0;">© Shafiq Cards · Premium Wedding Stationery</p>
        </div>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
  console.log('✅ Password reset email sent to:', toEmail);
};

module.exports = {
  sendOtpEmail,
  sendVerificationEmail,
  sendRSVPEmail,
  sendResetCodeEmail,
};
