# Email Sender App

Send bulk emails (up to 1000 recipients) with:
- single receiver input
- manual receiver list
- CSV receiver import
- Word-like rich-text template editor toolbar
- optional background template image for email body
- attachments/images/files

## Requirements
- Node.js 18+

## Install
```bash
npm install
```

## Run
```bash
npm start
```

Open: `http://localhost:3000`

## How to use
1. Fill sender details and SMTP details.
2. Add recipients using one or more options:
   - Single receiver field
   - Manual list (comma/newline separated)
   - CSV upload (emails can be in any column)
3. Add subject and email template in editor (Word-like toolbar).
4. Optionally upload a background template image.
5. Optionally upload attachments/files/images.
6. Click **Send Email**.

## Notes
- Max recipients per send: **1000** (hard limit).
- Emails are sent using `bcc` so recipients are hidden from each other.
- For Gmail, use an App Password (not normal account password).
- Background template uses inline CID image. Rendering may vary by email client.

## Gmail App Password Setup
Use this when sending through Gmail SMTP (`smtp.gmail.com`).

1. Sign in to the Gmail account you want to send from.
2. Open `https://myaccount.google.com/security`.
3. Enable **2-Step Verification**.
4. Open `https://myaccount.google.com/apppasswords`.
5. Create an app password (example name: `Email Console`).
6. Copy the generated 16-character password.
7. Paste it into `SMTP Password / App Password` in this app.

### Important
- `Sender Email` and `SMTP Username` should usually be the same Gmail account.
- Do not use your normal Gmail login password in SMTP password field.
- If `App passwords` is missing on a company Google account, your admin may have disabled it. In that case, request SMTP relay credentials/settings from your admin.


### App Password:
rvwx mzoc aoof cycc