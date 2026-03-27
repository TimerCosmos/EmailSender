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
          message: 'Please fill all required sender/SMTP/subject/template fields.'
        });
      }

      if (!isValidEmail(senderEmail)) {
        return res.status(400).json({ ok: false, message: 'Sender email is invalid.' });
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
        return res.status(400).json({ ok: false, message: 'Add at least one valid recipient.' });
      }

      if (recipients.length > MAX_RECIPIENTS) {
        return res.status(400).json({
          ok: false,
          message: `Recipient limit exceeded. Maximum allowed is ${MAX_RECIPIENTS}.`
        });
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

      const attachments = (req.files?.attachments || []).map((file) => ({
        filename: file.originalname,
        content: file.buffer,
        contentType: file.mimetype
      }));

      let finalHtml = htmlBody;
      const bgFile = req.files?.templateBackground?.[0];
      if (bgFile) {
        const bgCid = `bg-template-${Date.now()}@emailsender`;
        attachments.push({
          filename: bgFile.originalname,
          content: bgFile.buffer,
          contentType: bgFile.mimetype,
          cid: bgCid
        });

        finalHtml = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            background="cid:${bgCid}"
            style="width:100%; background-image:url('cid:${bgCid}'); background-size:cover; background-position:center;">
            <tr>
              <td style="padding:24px; background-color: rgba(255,255,255,0.84);">
                ${htmlBody}
              </td>
            </tr>
          </table>
        `;
      }

      const fromValue = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;

      const mailOptions = {
        from: fromValue,
        bcc: recipients,
        subject,
        html: finalHtml,
        attachments
      };

      const info = await transporter.sendMail(mailOptions);

      return res.json({
        ok: true,
        messageId: info.messageId,
        acceptedCount: recipients.length,
        message: `Email sent to ${recipients.length} recipient(s).`
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: error.message || 'Failed to send email.'
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Email sender running at http://localhost:${PORT}`);
});
