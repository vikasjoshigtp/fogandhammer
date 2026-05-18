const nodemailer = require('nodemailer');

const ENQUIRY_TO = process.env.ENQUIRY_TO || 'hello@fogandhammer.com';
const REQUIRED_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) : {};
}

function clean(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: 'Invalid request body.' });
  }

  const name = clean(payload.name);
  const email = clean(payload.email);
  const message = clean(payload.message);

  if (!name || !isValidEmail(email) || !message) {
    return sendJson(res, 400, { ok: false, error: 'Name, valid email, and message are required.' });
  }

  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length) {
    return sendJson(res, 500, { ok: false, error: 'SMTP is not configured.' });
  }

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port)) {
    return sendJson(res, 500, { ok: false, error: 'SMTP port is invalid.' });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: ENQUIRY_TO,
      replyTo: email,
      subject: `Website enquiry from ${name}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        '',
        message
      ].join('\n'),
      html: [
        `<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
        `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
        `<p><strong>Message:</strong></p>`,
        `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`
      ].join('')
    });

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 502, { ok: false, error: 'Unable to send enquiry.' });
  }
};
