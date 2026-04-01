const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { parse } = require('csv-parse/sync');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_RECIPIENTS = 1000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 25,
    fileSize: 25 * 1024 * 1024
  }
});

app.use(express.static(path.join(__dirname, 'public')));

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmailList(input) {
  if (!input) return [];

  return input
    .split(/[\n,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function extractFromCsv(buffer) {
  const text = buffer.toString('utf8');
  const rows = parse(text, { skip_empty_lines: true });

  const result = [];
  for (const row of rows) {
    for (const cell of row) {
      if (!cell) continue;
      const value = String(cell).trim().toLowerCase();
      if (isValidEmail(value)) result.push(value);
    }
  }

  return result;
}

function uniqueEmails(emails) {
  return Array.from(new Set(emails));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.post(
  '/api/send',
  upload.fields([
    { name: 'recipientsCsv', maxCount: 1 },
    { name: 'templateBackground', maxCount: 1 },
    { name: 'attachments', maxCount: 25 }
  ]),
  async (req, res) => {
    try {
      const {
        senderEmail,
        senderName,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
        smtpPass,
        manualRecipients,
        singleRecipient,
        subject,
        htmlBody
      } = req.body;

      if (!senderEmail || !smtpHost || !smtpPort || !smtpUser || !smtpPass || !subject || !htmlBody) {
        return res.status(400).json({
          ok: false,
          message: 'Please fill all required fields.'
        });
      }

      let recipients = [
        ...normalizeEmailList(singleRecipient),
        ...normalizeEmailList(manualRecipients)
      ];

      const csvFile = req.files?.recipientsCsv?.[0];
      if (csvFile) {
        recipients = recipients.concat(extractFromCsv(csvFile.buffer));
      }

      recipients = uniqueEmails(recipients).filter(isValidEmail);

      if (recipients.length === 0) {
        return res.status(400).json({ ok: false, message: 'No valid recipients found.' });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort),
        secure: String(smtpSecure) === 'true',
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const attachments = (req.files?.attachments || []).map(file => ({
        filename: file.originalname,
        content: file.buffer,
        contentType: file.mimetype
      }));

      const fromValue = senderName
        ? `"${senderName}" <${senderEmail}>`
        : senderEmail;

      // 🔥 BULK LOOP
      for (const recipient of recipients) {
        console.log("Sending to:", recipient);

        await transporter.sendMail({
          from: fromValue,
          to: recipient,
          subject,
          html: htmlBody,
          attachments
        });

        await delay(300); // prevent Gmail blocking
      }

      return res.json({
        ok: true,
        message: `Emails sent to ${recipients.length} recipients`
      });

    } catch (error) {
      console.error(error);
      return res.status(500).json({
        ok: false,
        message: error.message || 'Failed to send email.'
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});