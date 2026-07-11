import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Helper to retrieve, trim, and sanitize SMTP configurations from environment variables.
// This prevents common user copy-paste issues (like quotes or surrounding whitespace) from breaking logins.
function getSmtpConfig() {
  let host = (process.env.EMAIL_SMTP_HOST || "").trim().replace(/^["']|["']$/g, "");
  const port = (process.env.EMAIL_SMTP_PORT || "587").trim().replace(/^["']|["']$/g, "");
  let user = (process.env.EMAIL_SMTP_USER || "").trim().replace(/^["']|["']$/g, "");
  let pass = (process.env.EMAIL_SMTP_PASS || "").trim().replace(/^["']|["']$/g, "");

  // Auto-correct SMTP host if the user accidentally put their email address in EMAIL_SMTP_HOST
  if (host && host.includes("@")) {
    console.warn(`[SMTP Config Warning] EMAIL_SMTP_HOST seems to be configured with an email address: "${host}". Resolving to actual SMTP server...`);
    const domain = host.split("@")[1]?.toLowerCase();
    if (domain === "gmail.com") {
      host = "smtp.gmail.com";
    } else if (domain === "outlook.com" || domain === "hotmail.com") {
      host = "smtp.office365.com";
    } else if (domain === "yahoo.com") {
      host = "smtp.mail.yahoo.com";
    } else if (domain) {
      host = `smtp.${domain}`;
    } else {
      host = "smtp.gmail.com"; // safe fallback
    }
    console.log(`[SMTP Config Resolved] Corrected EMAIL_SMTP_HOST to: "${host}"`);
  }

  return { host, port, user, pass };
}

const app = express();
const PORT = 3000;

app.use(express.json());

// API route for email notifications
app.post("/api/send-email", async (req, res) => {
  const { student, adminEmail } = req.body;
  if (!student) {
    return res.status(400).json({ error: "Student details are required" });
  }

  const { name, email, mobile, address, age, fatherName, className, stream } = student;
  const targetEmail = (adminEmail || process.env.ADMIN_EMAIL_RECEIVER || "imranansari399605@gmail.com").trim().replace(/^["']|["']$/g, "");

  console.log(`[Email Notification Request] Recipient: ${targetEmail}`);
  console.log(`[Student Details]`, student);

  const { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass } = getSmtpConfig();

  const emailSubject = `🔔 Royal Coaching Centre - New Registration: ${name}`;
  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #1e3a8a; border-bottom: 2px solid #fbbf24; padding-bottom: 10px;">New Student Registration Alert</h2>
      <p>A new student has submitted the online admission form at <strong>Royal Coaching Centre</strong>.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; font-weight: bold; width: 150px; border: 1px solid #e2e8f0;">Student Name:</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${name || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Mobile:</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${mobile || "N/A"}</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Email:</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;"><a href="mailto:${email}">${email || "N/A"}</a></td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Age:</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${age || "N/A"}</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Father's Name:</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${fatherName || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Class / Grade:</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${className || "N/A"}</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Stream / Batch:</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${stream || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; vertical-align: top; border: 1px solid #e2e8f0;">Address:</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0;">${address || "N/A"}</td>
        </tr>
      </table>
      
      <div style="background-color: #eff6ff; padding: 15px; border-radius: 6px; margin-top: 20px;">
        <p style="margin: 0; font-size: 13px; color: #1e40af;">
          <strong>Action Required:</strong> Please log in to the Admin Dashboard to review, approve, or reject this application and manage fee records.
        </p>
      </div>
      
      <p style="font-size: 11px; color: #64748b; text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
        This is an automated notification from the Royal Coaching Centre system.
      </p>
    </div>
  `;

  // If SMTP is configured, send the real email
  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort || "587"),
        secure: smtpPort === "465",
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const mailOptions = {
        from: `"Royal Coaching Centre" <${smtpUser}>`,
        to: targetEmail,
        subject: emailSubject,
        html: emailHtml,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`[Email Success] Email sent: ${info.messageId}`);
      return res.json({ success: true, sent: true, messageId: info.messageId });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Email Error] Failed to send via SMTP:", err);
      
      if (errMsg.includes("535") || errMsg.toLowerCase().includes("accepted") || errMsg.toLowerCase().includes("login") || errMsg.toLowerCase().includes("username")) {
        console.error("\n==============================================================");
        console.error("🔑 SMTP AUTHENTICATION GUIDE (535 Invalid Login):");
        console.error("The SMTP server rejected your username or password.");
        console.error("If you are using Google/Gmail (smtp.gmail.com):");
        console.error("  1. You CANNOT use your regular Gmail account password.");
        console.error("  2. Go to your Google Account Settings -> Security.");
        console.error("  3. Turn on '2-Step Verification' if not already enabled.");
        console.error("  4. Visit Google App Passwords (https://myaccount.google.com/apppasswords).");
        console.error("  5. Generate a new App Password (e.g. named 'Royal Coaching').");
        console.error("  6. Copy the 16-character code and set it as EMAIL_SMTP_PASS in the Environment Variables.");
        console.error("==============================================================\n");
      }

      // Fallback: return 200 OK with detailed error description so frontend does not fail!
      return res.json({ 
        success: true, 
        sent: false, 
        error: errMsg,
        fallback: "Logged registration details to console server-side." 
      });
    }
  } else {
    console.log(`[Email Fallback Mode] SMTP is not configured. Here is the email summary:`);
    console.log(`Subject: ${emailSubject}`);
    console.log(`Body:\n${emailHtml}`);
    return res.json({
      success: true,
      sent: false,
      info: "Email logged to console since SMTP is not configured. Please add SMTP environment variables to use real emails.",
    });
  }
});

// SMTP Status query endpoint
app.get("/api/smtp-status", (req, res) => {
  const { host, port, user, pass } = getSmtpConfig();

  return res.json({
    configured: !!(host && user && pass),
    host,
    port,
    user: user ? (user.includes("@") ? `${user.split("@")[0].substring(0, 3)}***@${user.split("@")[1]}` : `${user.substring(0, 3)}***`) : "",
    hasPass: !!pass,
  });
});

// SMTP Credentials connection tester
app.post("/api/test-smtp", async (req, res) => {
  const { testEmail } = req.body;
  if (!testEmail) {
    return res.status(400).json({ error: "Test receiver email address is required" });
  }

  const { host, port, user, pass } = getSmtpConfig();

  if (!host || !user || !pass) {
    return res.status(400).json({
      success: false,
      error: "SMTP configuration is incomplete. Please ensure EMAIL_SMTP_HOST, EMAIL_SMTP_USER, and EMAIL_SMTP_PASS are configured in the environment settings.",
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: port === "465",
      auth: {
        user,
        pass,
      },
    });

    const mailOptions = {
      from: `"Royal Coaching Centre Test" <${user}>`,
      to: testEmail.trim().replace(/^["']|["']$/g, ""),
      subject: "Royal Coaching Centre - SMTP Configuration Test",
      html: `
        <div style="font-family: sans-serif; padding: 25px; border: 2px solid #e2e8f0; border-radius: 12px; max-width: 500px; margin: auto; background-color: #f8fafc;">
          <h2 style="color: #059669; font-weight: 800; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-top: 0; font-size: 20px;">✓ SMTP Connection Successful!</h2>
          <p style="color: #334155; font-size: 14px; line-height: 1.5;">This is a test email confirming that your SMTP credential settings are fully verified and working correctly.</p>
          <div style="background-color: #ffffff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-top: 15px;">
            <ul style="font-size: 12px; color: #475569; line-height: 1.6; padding-left: 15px; margin: 0;">
              <li><strong>SMTP Server:</strong> ${host}</li>
              <li><strong>Port:</strong> ${port}</li>
              <li><strong>Auth User:</strong> ${user}</li>
            </ul>
          </div>
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-bottom: 0;">
            Royal Coaching Centre Management System
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return res.json({ success: true, message: "Test email sent successfully!" });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    let recommendation = "Verify your SMTP host, port, username, and password.";
    
    if (errMsg.includes("535") || errMsg.toLowerCase().includes("accepted") || errMsg.toLowerCase().includes("login") || errMsg.toLowerCase().includes("username")) {
      recommendation = "Authentication failed (535). If using Gmail, you MUST enable 2-Step Verification and generate a 16-character 'App Password' from Google Account Settings -> Security -> App Passwords. Do NOT use your standard account password.";
    } else if (errMsg.includes("ETIMEDOUT") || errMsg.includes("ECONNREFUSED")) {
      recommendation = "Connection timed out or refused. Please verify that the SMTP host is correct, that port 587 is open, and that secure configuration matches your provider requirements.";
    }

    return res.json({
      success: false,
      error: errMsg,
      recommendation,
    });
  }
});

// Vite or Static file serving
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

setupServer();
