const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'AI Video Content Studio <no-reply@domain.com>';

let transporter = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  console.log(`[Email] Service configured. Host: ${SMTP_HOST}`);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for 587 or others
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
} else {
  console.log('[Email] Service not configured. Welcome emails will be mock-printed to the console.');
}

async function sendWelcomeEmail(toEmail) {
  const subject = 'Welcome to AI Video Content Studio! 🎬';
  const text = `Hi,

Welcome to AI Video Content Studio! We are thrilled to have you join us.

With AI Video Content Studio, you can:
1. Write or parse scripts into scenes automatically.
2. Generate highly descriptive video prompts for ComfyUI, Fal.ai, or Replicate.
3. Render high-quality voiceovers in English, Hindi, Kannada, or Tamil.
4. Merge background music, add auto captions, and compile final videos ready for YouTube or YouTube Shorts!

To get started, log in to your dashboard and create your first project.

Best regards,
The AI Video Content Studio Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #8a5cf6; text-align: center;">🎬 Welcome to AI Video Content Studio!</h2>
      <p>Hi there,</p>
      <p>Welcome to <strong>AI Video Content Studio</strong>! We are thrilled to have you join us.</p>
      <p>With our studio, you can automate your video content creation pipeline with ease:</p>
      <ul>
        <li><strong>AI Script Generator</strong>: Create full scripts from quick topic prompts.</li>
        <li><strong>Visual Storyboarding</strong>: AI translates script narration into rich visual video generation prompts.</li>
        <li><strong>Multi-language Voices</strong>: Generate professional voiceovers in English, Hindi, Kannada, and Tamil.</li>
        <li><strong>Automatic Subtitles</strong>: Burn-in dynamic subtitles tailored to the video's aspect ratio.</li>
      </ul>
      <p>Ready to start? Open the editor dashboard and click <strong>"+ New"</strong> to create your first project!</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #888; text-align: center;">
        This is an automated message from AI Video Content Studio.
      </p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: toEmail,
        subject: subject,
        text: text,
        html: html
      });
      console.log(`[Email] Welcome email sent successfully to ${toEmail}`);
      return true;
    } catch (err) {
      console.error(`[Email] Failed to send welcome email to ${toEmail}:`, err);
      return false;
    }
  } else {
    console.log(`[Email Mock] Welcome email to ${toEmail} would contain:`);
    console.log(`Subject: ${subject}`);
    console.log(`Text:\n${text}`);
    return true;
  }
}

module.exports = {
  sendWelcomeEmail
};
