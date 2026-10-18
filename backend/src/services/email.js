const nodemailer = require('nodemailer');
const config = require('../config');

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: config.salon.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(date));
}

function formatTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: config.salon.timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

function formatPrice(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: config.salon.currency }).format(cents / 100);
}

function layout(title, bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f3f1;font-family:Arial,Helvetica,sans-serif;color:#2d2a28;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#8c4a5c;color:#ffffff;padding:20px 24px;font-size:20px;font-weight:bold;">
        ${escapeHtml(config.salon.name)}
      </td></tr>
      <tr><td style="padding:24px;">
        <h2 style="margin:0 0 16px;font-size:18px;">${escapeHtml(title)}</h2>
        ${bodyHtml}
      </td></tr>
    </table>
  </body>
</html>`;
}

function detailsTable(booking) {
  const rows = [
    ['Booking #', booking.id],
    ['Service', booking.service_name],
    ['When', formatDateTime(booking.start_time)],
    ['Ends', formatTime(booking.end_time)],
    ['Duration', `${booking.duration_minutes} minutes`],
    ['Price', formatPrice(booking.price_cents)],
  ];
  if (booking.notes) rows.push(['Notes', booking.notes]);

  return `<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;">
    ${rows
      .map(
        ([label, value]) => `<tr>
          <td style="padding:8px 0;color:#7a716c;width:110px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;font-weight:bold;">${escapeHtml(value)}</td>
        </tr>`
      )
      .join('')}
  </table>`;
}

function buildAdminEmail(booking) {
  const html = layout(
    'New booking received',
    `<p style="margin:0 0 16px;">A new appointment was just booked.</p>
     ${detailsTable(booking)}
     <h3 style="margin:24px 0 8px;font-size:15px;">Client</h3>
     <p style="margin:0;font-size:14px;line-height:1.6;">
       ${escapeHtml(booking.client_name)}<br/>
       ${escapeHtml(booking.client_email)}<br/>
       ${escapeHtml(booking.client_phone || 'No phone provided')}
     </p>`
  );

  return {
    from: config.email.from,
    to: config.email.adminEmail,
    replyTo: booking.client_email,
    subject: `New booking: ${booking.service_name} — ${booking.client_name} (${formatDateTime(booking.start_time)})`,
    html,
    text: [
      'New booking received',
      `Booking #${booking.id}`,
      `Service: ${booking.service_name}`,
      `When: ${formatDateTime(booking.start_time)}`,
      `Client: ${booking.client_name} <${booking.client_email}> ${booking.client_phone || ''}`,
      booking.notes ? `Notes: ${booking.notes}` : '',
    ].join('\n'),
  };
}

function buildClientEmail(booking) {
  const html = layout(
    'Your appointment is confirmed',
    `<p style="margin:0 0 16px;">Hi ${escapeHtml(booking.client_name)}, thanks for booking with us! Here is your receipt.</p>
     ${detailsTable(booking)}
     <p style="margin:24px 0 0;font-size:13px;color:#7a716c;">
       Need to cancel? You can do it from "My Appointments" in your account.
     </p>`
  );

  return {
    from: config.email.from,
    to: booking.client_email,
    subject: `Booking confirmed: ${booking.service_name} on ${formatDateTime(booking.start_time)}`,
    html,
    text: [
      `Hi ${booking.client_name}, your appointment is confirmed.`,
      `Booking #${booking.id}`,
      `Service: ${booking.service_name}`,
      `When: ${formatDateTime(booking.start_time)}`,
      `Price: ${formatPrice(booking.price_cents)}`,
    ].join('\n'),
  };
}

/**
 * Sends the admin notification and client receipt in parallel.
 * `booking` must come from the JOINed booking query (client + service fields).
 */
async function sendBookingEmails(booking) {
  await Promise.all([
    transporter.sendMail(buildAdminEmail(booking)),
    transporter.sendMail(buildClientEmail(booking)),
  ]);
}

async function verifyEmailTransport() {
  try {
    await transporter.verify();
    console.log('✔ SMTP connection verified');
  } catch (err) {
    console.warn(`⚠ SMTP verification failed (bookings still work, emails will fail): ${err.message}`);
  }
}

module.exports = { sendBookingEmails, verifyEmailTransport };
