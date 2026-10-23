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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: config.salon.currency,
    currencyDisplay: 'narrowSymbol',
  }).format(cents / 100);
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

// Absolute link to the customer's "manage booking" page (view / reschedule / cancel, no login needed)
function manageUrl(booking) {
  return `${config.publicUrl}/manage/${booking.manage_token}`;
}

function button(href, label) {
  return `<p style="margin:24px 0 0;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#8c4a5c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;font-size:14px;">${escapeHtml(label)}</a>
  </p>`;
}

function clientBlock(booking) {
  return `<h3 style="margin:24px 0 8px;font-size:15px;">Client</h3>
     <p style="margin:0;font-size:14px;line-height:1.6;">
       ${escapeHtml(booking.client_name)}${booking.client_id ? '' : ' <span style="color:#7a716c;">(guest)</span>'}<br/>
       ${escapeHtml(booking.client_email)}<br/>
       ${escapeHtml(booking.client_phone || 'No phone provided')}
     </p>`;
}

function clientText(booking) {
  return `Client: ${booking.client_name} <${booking.client_email}> ${booking.client_phone || ''}${booking.client_id ? '' : ' (guest)'}`;
}

function buildAdminEmail(booking) {
  const html = layout(
    'New booking request',
    `<p style="margin:0 0 16px;">A new appointment was just requested. It stays <strong>pending</strong> until you confirm it on the dashboard.</p>
     ${detailsTable(booking)}
     ${clientBlock(booking)}
     ${button(`${config.publicUrl}/admin`, 'Open dashboard to confirm')}`
  );

  return {
    from: config.email.from,
    to: config.email.adminEmail,
    replyTo: booking.client_email,
    subject: `New booking request: ${booking.service_name} — ${booking.client_name} (${formatDateTime(booking.start_time)})`,
    html,
    text: [
      'New booking request (pending your confirmation)',
      `Booking #${booking.id}`,
      `Service: ${booking.service_name}`,
      `When: ${formatDateTime(booking.start_time)}`,
      clientText(booking),
      booking.notes ? `Notes: ${booking.notes}` : '',
      `Confirm it at ${config.publicUrl}/admin`,
    ].join('\n'),
  };
}

function buildClientEmail(booking) {
  const html = layout(
    'We received your booking request',
    `<p style="margin:0 0 16px;">Hi ${escapeHtml(booking.client_name)}, thanks for booking with us!
       Your appointment is <strong>pending</strong>. We'll email you again as soon as the salon confirms it.</p>
     ${detailsTable(booking)}
     ${button(manageUrl(booking), 'View, reschedule or cancel')}
     <p style="margin:16px 0 0;font-size:13px;color:#7a716c;">
       Keep this email: the button above is your private link to manage this booking.
     </p>`
  );

  return {
    from: config.email.from,
    to: booking.client_email,
    subject: `Booking request received: ${booking.service_name} on ${formatDateTime(booking.start_time)}`,
    html,
    text: [
      `Hi ${booking.client_name}, we received your booking request. It is pending until the salon confirms it.`,
      `Booking #${booking.id}`,
      `Service: ${booking.service_name}`,
      `When: ${formatDateTime(booking.start_time)}`,
      `Price: ${formatPrice(booking.price_cents)}`,
      `View, reschedule or cancel: ${manageUrl(booking)}`,
    ].join('\n'),
  };
}

// Sent to the customer when the salon changes the status of their booking
const STATUS_MESSAGES = {
  confirmed: {
    title: 'Your appointment is confirmed',
    subject: 'Booking confirmed',
    intro: 'Good news: the salon has confirmed your appointment. See you soon!',
  },
  cancelled: {
    title: 'Your appointment was cancelled',
    subject: 'Booking cancelled',
    intro: 'Unfortunately the salon had to cancel this appointment. Reply to this email or book another time.',
  },
};

function buildStatusEmail(booking) {
  const msg = STATUS_MESSAGES[booking.status];
  const action =
    booking.status === 'cancelled'
      ? button(`${config.publicUrl}/book?serviceId=${booking.service_id}`, 'Book another time')
      : button(manageUrl(booking), 'View, reschedule or cancel');

  return {
    from: config.email.from,
    to: booking.client_email,
    replyTo: config.email.adminEmail,
    subject: `${msg.subject}: ${booking.service_name} on ${formatDateTime(booking.start_time)}`,
    html: layout(
      msg.title,
      `<p style="margin:0 0 16px;">Hi ${escapeHtml(booking.client_name)}, ${escapeHtml(msg.intro)}</p>
       ${detailsTable(booking)}
       ${action}`
    ),
    text: [
      `Hi ${booking.client_name}, ${msg.intro}`,
      `Booking #${booking.id}`,
      `Service: ${booking.service_name}`,
      `When: ${formatDateTime(booking.start_time)}`,
      booking.status === 'cancelled' ? '' : `Manage your booking: ${manageUrl(booking)}`,
    ].join('\n'),
  };
}

function buildRescheduleAdminEmail(booking, previousStart) {
  return {
    from: config.email.from,
    to: config.email.adminEmail,
    replyTo: booking.client_email,
    subject: `Rescheduled: ${booking.service_name} — ${booking.client_name} (now ${formatDateTime(booking.start_time)})`,
    html: layout(
      'Booking rescheduled',
      `<p style="margin:0 0 16px;">${escapeHtml(booking.client_name)} moved their appointment from
         <strong>${escapeHtml(formatDateTime(previousStart))}</strong>. It is <strong>pending</strong> again until you confirm the new time.</p>
       ${detailsTable(booking)}
       ${clientBlock(booking)}
       ${button(`${config.publicUrl}/admin`, 'Open dashboard to confirm')}`
    ),
    text: [
      'Booking rescheduled (pending your confirmation)',
      `Booking #${booking.id}`,
      `Service: ${booking.service_name}`,
      `Was: ${formatDateTime(previousStart)}`,
      `Now: ${formatDateTime(booking.start_time)}`,
      clientText(booking),
    ].join('\n'),
  };
}

function buildRescheduleClientEmail(booking) {
  return {
    from: config.email.from,
    to: booking.client_email,
    subject: `Reschedule request received: ${booking.service_name} on ${formatDateTime(booking.start_time)}`,
    html: layout(
      'We received your new time',
      `<p style="margin:0 0 16px;">Hi ${escapeHtml(booking.client_name)}, your appointment has been moved and is
         <strong>pending</strong> until the salon confirms the new time. We'll email you when it's confirmed.</p>
       ${detailsTable(booking)}
       ${button(manageUrl(booking), 'View, reschedule or cancel')}`
    ),
    text: [
      `Hi ${booking.client_name}, your appointment has been moved and is pending until the salon confirms it.`,
      `Booking #${booking.id}`,
      `Service: ${booking.service_name}`,
      `When: ${formatDateTime(booking.start_time)}`,
      `Manage your booking: ${manageUrl(booking)}`,
    ].join('\n'),
  };
}

function buildCustomerCancelledAdminEmail(booking) {
  return {
    from: config.email.from,
    to: config.email.adminEmail,
    replyTo: booking.client_email,
    subject: `Cancelled by client: ${booking.service_name} — ${booking.client_name} (${formatDateTime(booking.start_time)})`,
    html: layout(
      'Booking cancelled by client',
      `<p style="margin:0 0 16px;">This appointment was cancelled by the client. The time slot is free again.</p>
       ${detailsTable(booking)}
       ${clientBlock(booking)}`
    ),
    text: [
      'Booking cancelled by client',
      `Booking #${booking.id}`,
      `Service: ${booking.service_name}`,
      `When: ${formatDateTime(booking.start_time)}`,
      clientText(booking),
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

/** Tells the customer the salon confirmed or cancelled their booking. Other statuses send nothing. */
async function sendStatusEmail(booking) {
  if (!STATUS_MESSAGES[booking.status]) return false;
  await transporter.sendMail(buildStatusEmail(booking));
  return true;
}

async function sendRescheduleEmails(booking, previousStart) {
  await Promise.all([
    transporter.sendMail(buildRescheduleAdminEmail(booking, previousStart)),
    transporter.sendMail(buildRescheduleClientEmail(booking)),
  ]);
}

async function sendCustomerCancelledEmail(booking) {
  await transporter.sendMail(buildCustomerCancelledAdminEmail(booking));
}

async function verifyEmailTransport() {
  try {
    await transporter.verify();
    console.log('✔ SMTP connection verified');
  } catch (err) {
    console.warn(`⚠ SMTP verification failed (bookings still work, emails will fail): ${err.message}`);
  }
}

module.exports = {
  sendBookingEmails,
  sendStatusEmail,
  sendRescheduleEmails,
  sendCustomerCancelledEmail,
  verifyEmailTransport,
};
