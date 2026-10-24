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

// Same palette and fonts as the website (frontend/src/index.css)
const COLORS = {
  text: '#141414',
  muted: '#6e6a6c',
  border: '#f1e3ea',
  pink: '#f7acd9',
  pinkSoft: '#fdeef6',
  surfaceAlt: '#fff7fb',
  footerText: '#d8d4d6',
};
const FONT_BODY = "'Outfit','Helvetica Neue',Helvetica,Arial,sans-serif";
const FONT_DISPLAY = "'Playfair Display',Georgia,'Times New Roman',serif";

function layout(title, bodyHtml) {
  const { salon } = config;
  const contact = [salon.address, salon.phone, salon.email].filter(Boolean).map(escapeHtml).join(' &middot; ');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&family=Playfair+Display:ital,wght@0,600;1,600&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:24px 12px;background:${COLORS.surfaceAlt};font-family:${FONT_BODY};color:${COLORS.text};line-height:1.55;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${COLORS.border};border-radius:14px;overflow:hidden;">
      <tr><td style="padding:24px 24px 18px;text-align:center;border-bottom:4px solid ${COLORS.pink};">
        <a href="${escapeHtml(config.publicUrl)}" style="text-decoration:none;">
          <img src="${escapeHtml(`${config.publicUrl}/email-logo.png`)}" width="240" alt="${escapeHtml(salon.name)}"
            style="display:block;margin:0 auto;width:240px;max-width:100%;height:auto;border:0;font-family:${FONT_DISPLAY};font-size:22px;font-weight:600;color:${COLORS.text};" />
        </a>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <h2 style="margin:0 0 16px;font-family:${FONT_DISPLAY};font-size:24px;font-weight:600;line-height:1.25;color:${COLORS.text};">${escapeHtml(title)}</h2>
        ${bodyHtml}
      </td></tr>
      <tr><td style="background:${COLORS.text};color:${COLORS.footerText};padding:20px 24px;font-size:12px;line-height:1.6;text-align:center;">
        <div style="font-family:${FONT_DISPLAY};font-size:16px;color:#ffffff;margin-bottom:4px;">${escapeHtml(salon.name)}</div>
        ${contact}<br/>
        <a href="${escapeHtml(config.publicUrl)}" style="color:${COLORS.pink};text-decoration:none;">${escapeHtml(config.publicUrl.replace(/^https?:\/\//, ''))}</a>
      </td></tr>
    </table>
  </body>
</html>`;
}

const PICKUP_TIERS = { luxury: 'Luxury', basic: 'Basic' };

// "Luxury · Toyota Prado 2024 · 6 hours", or null when the customer didn't add a pickup
function pickupSummary(booking) {
  if (!booking.pickup_hours) return null;
  return `${PICKUP_TIERS[booking.pickup_tier] || ''} · ${booking.pickup_vehicle_name} · ${booking.pickup_hours} hours`;
}

function totalCents(booking) {
  return booking.price_cents + (booking.pickup_price_cents || 0);
}

function pickupText(booking) {
  if (!booking.pickup_hours) return '';
  return [
    `Pickup: ${pickupSummary(booking)} (${formatPrice(booking.pickup_price_cents)})`,
    `Pickup address: ${booking.pickup_address}`,
    `Total: ${formatPrice(totalCents(booking))}`,
  ].join('\n');
}

const DEPOSIT_LABELS = {
  unpaid: 'not paid yet',
  paid: 'paid',
  refunded: 'refunded in full',
  partially_refunded: 'partly refunded',
  forfeited: 'kept (late cancellation)',
  refund_due: 'refund being processed',
  refund_failed: 'refund being processed',
};

function depositLabel(booking) {
  if (booking.deposit_status === 'unpaid' && booking.payment_method === 'transfer') return 'awaiting bank transfer';
  return DEPOSIT_LABELS[booking.deposit_status] || booking.deposit_status;
}

// What to put in the transfer narration so the salon can match the payment to the booking
function transferReference(booking) {
  return `Booking ${booking.id}`;
}

function awaitingTransfer(booking) {
  return booking.deposit_status === 'unpaid' && booking.payment_method === 'transfer';
}

function transferBlock(booking) {
  const { banks } = config.payments;
  const rows = [
    ['Amount', formatPrice(booking.deposit_cents)],
    ['Reference', transferReference(booking)],
    ...banks.map((bank, i) => [
      banks.length > 1 ? `Account ${i + 1}` : 'Account',
      `${bank.name} · ${bank.accountNumber} · ${bank.accountName}`,
    ]),
  ];
  return `<h3 style="margin:24px 0 8px;font-family:${FONT_DISPLAY};font-size:17px;font-weight:600;">Pay your deposit by bank transfer</h3>
    <p style="margin:0 0 8px;font-size:14px;">Your booking is held for you, and the salon will confirm it once your deposit arrives.
      ${banks.length > 1 ? 'Pay into any one of these accounts.' : ''}</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;background:${COLORS.pinkSoft};border-radius:8px;">
      ${rows
        .map(
          ([label, value]) => `<tr>
            <td style="padding:8px 12px;color:${COLORS.muted};width:130px;">${escapeHtml(label)}</td>
            <td style="padding:8px 12px;font-weight:bold;">${escapeHtml(value)}</td>
          </tr>`
        )
        .join('')}
    </table>`;
}

function transferText(booking) {
  const { banks } = config.payments;
  return [
    `Pay your ${formatPrice(booking.deposit_cents)} deposit by bank transfer${banks.length > 1 ? ' into any one of:' : ':'}`,
    ...banks.map((bank) => `${bank.name} · ${bank.accountNumber} · ${bank.accountName}`),
    `Reference: ${transferReference(booking)}`,
  ].join('\n');
}

function depositRows(booking) {
  if (!booking.deposit_cents) return [];
  const rows = [
    ['Deposit', `${formatPrice(booking.deposit_cents)} (${depositLabel(booking)})`],
  ];
  if (['paid', 'unpaid'].includes(booking.deposit_status) && booking.status !== 'cancelled') {
    rows.push(['Balance due at salon', formatPrice(totalCents(booking) - booking.deposit_cents)]);
  }
  if (booking.refund_cents) rows.push(['Refund', formatPrice(booking.refund_cents)]);
  return rows;
}

function depositText(booking) {
  return depositRows(booking)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

// "Free cancellation up to 24 hours before…", shown to clients who paid a deposit
function cancellationPolicy() {
  const { freeCancellationHours, lateCancelRefundPercent } = config.payments;
  return (
    `Cancel at least ${freeCancellationHours} hours before your appointment for a full refund of your deposit. ` +
    `Later cancellations get ${lateCancelRefundPercent}% of the deposit back.`
  );
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
  if (booking.pickup_hours) {
    rows.push(
      ['Pickup', `${pickupSummary(booking)} (${formatPrice(booking.pickup_price_cents)})`],
      ['Pickup address', booking.pickup_address],
      ['Total', formatPrice(totalCents(booking))]
    );
  }
  rows.push(...depositRows(booking));
  if (booking.notes) rows.push(['Notes', booking.notes]);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;font-size:14px;background:${COLORS.surfaceAlt};border:1px solid ${COLORS.border};border-radius:12px;">
    ${rows
      .map(
        ([label, value], i) => `<tr>
          <td style="padding:10px 16px;color:${COLORS.muted};width:120px;vertical-align:top;${i ? `border-top:1px solid ${COLORS.border};` : ''}">${escapeHtml(label)}</td>
          <td style="padding:10px 16px;font-weight:600;${i ? `border-top:1px solid ${COLORS.border};` : ''}">${escapeHtml(value)}</td>
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
    <a href="${escapeHtml(href)}" style="display:inline-block;background:${COLORS.pink};color:${COLORS.text};text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:600;font-size:15px;">${escapeHtml(label)}</a>
  </p>`;
}

function clientBlock(booking) {
  return `<h3 style="margin:24px 0 8px;font-family:${FONT_DISPLAY};font-size:17px;font-weight:600;">Client</h3>
     <p style="margin:0;font-size:14px;line-height:1.6;">
       ${escapeHtml(booking.client_name)}${booking.client_id ? '' : ` <span style="color:${COLORS.muted};">(guest)</span>`}<br/>
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
    `<p style="margin:0 0 16px;">A new appointment was just requested. It stays <strong>pending</strong> until you confirm it on the dashboard.
       ${awaitingTransfer(booking) ? `The client chose to pay the deposit by bank transfer (reference "${escapeHtml(transferReference(booking))}"): mark it received on the dashboard once it arrives.` : ''}</p>
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
      pickupText(booking),
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
     ${awaitingTransfer(booking) ? transferBlock(booking) : ''}
     ${button(manageUrl(booking), 'View, reschedule or cancel')}
     <p style="margin:16px 0 0;font-size:13px;color:${COLORS.muted};">
       Keep this email: the button above is your private link to manage this booking. You can also find it
       any time at ${escapeHtml(`${config.publicUrl}/booking/${booking.id}`)} with your email address.
       ${booking.deposit_cents ? escapeHtml(cancellationPolicy()) : ''}
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
      pickupText(booking),
      `Price: ${formatPrice(booking.price_cents)}`,
      depositText(booking),
      awaitingTransfer(booking) ? transferText(booking) : '',
      `View, reschedule or cancel: ${manageUrl(booking)}`,
      `Or find it any time at ${config.publicUrl}/booking/${booking.id} with your email address.`,
      booking.deposit_cents ? cancellationPolicy() : '',
    ].join('\n'),
  };
}

// Sent to the customer whenever the salon changes the status of their booking
const STATUS_MESSAGES = {
  pending: {
    title: 'Your appointment is pending',
    subject: 'Booking pending',
    intro: "your appointment is pending again. We'll email you as soon as the salon confirms it.",
  },
  confirmed: {
    title: 'Your appointment is confirmed',
    subject: 'Booking confirmed',
    intro: 'good news: the salon has confirmed your appointment. See you soon!',
  },
  cancelled: {
    title: 'Your appointment was cancelled',
    subject: 'Booking cancelled',
    intro:
      'unfortunately the salon had to cancel this appointment. Any deposit you paid is refunded in full. ' +
      'Reply to this email or book another time.',
    rebook: true,
  },
  completed: {
    title: 'Thanks for visiting us',
    subject: 'Appointment completed',
    intro: 'thank you for visiting! We hope you love your new look. Book your next appointment any time.',
    rebook: true,
  },
};

// Sent to the customer when the salon records money moving outside Paystack
const DEPOSIT_MESSAGES = {
  received: {
    title: 'We received your deposit',
    subject: 'Deposit received',
    intro: (booking) =>
      `we've received your ${formatPrice(booking.deposit_cents)} deposit. Thank you!` +
      (booking.status === 'pending' ? " We'll email you when the salon confirms your appointment." : ''),
  },
  refunded: {
    title: 'Your refund has been sent',
    subject: 'Refund sent',
    intro: (booking) =>
      `we've sent your ${formatPrice(booking.refund_cents)} refund. It can take a few working days to arrive.`,
  },
};

// The client paid after their slot was released, so the booking stays cancelled and the deposit goes back
const LATE_PAYMENT_MESSAGE = {
  title: 'Your payment came in too late',
  subject: 'Payment refunded',
  intro:
    'your payment arrived after we could no longer hold this time slot, so the booking was released ' +
    'and your deposit is being refunded in full. Please book another time.',
  rebook: true,
};

function buildUpdateEmail(booking, msg) {
  const intro = typeof msg.intro === 'function' ? msg.intro(booking) : msg.intro;
  const rebookUrl = `${config.publicUrl}/book?serviceId=${booking.service_id}`;
  const rebook = msg.rebook || booking.status === 'cancelled';
  const action = rebook
    ? button(rebookUrl, 'Book another time')
    : button(manageUrl(booking), 'View, reschedule or cancel');

  return {
    from: config.email.from,
    to: booking.client_email,
    replyTo: config.email.adminEmail,
    subject: `${msg.subject}: ${booking.service_name} on ${formatDateTime(booking.start_time)}`,
    html: layout(
      msg.title,
      `<p style="margin:0 0 16px;">Hi ${escapeHtml(booking.client_name)}, ${escapeHtml(intro)}</p>
       ${detailsTable(booking)}
       ${action}`
    ),
    text: [
      `Hi ${booking.client_name}, ${intro}`,
      `Booking #${booking.id}`,
      `Service: ${booking.service_name}`,
      `When: ${formatDateTime(booking.start_time)}`,
      pickupText(booking),
      depositText(booking),
      rebook ? `Book another time: ${rebookUrl}` : `Manage your booking: ${manageUrl(booking)}`,
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
      pickupText(booking),
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
      pickupText(booking),
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
      pickupText(booking),
      depositText(booking),
      clientText(booking),
    ].join('\n'),
  };
}

// What happens to the client's deposit after they cancel, in plain words (empty when no deposit was paid)
function cancelledRefundMessage(booking) {
  const refund = booking.refund_cents ? formatPrice(booking.refund_cents) : null;
  switch (booking.deposit_status) {
    case 'refunded':
    case 'partially_refunded':
      return (
        `${refund} of your deposit is being refunded to your card or account. ` +
        'It can take a few working days to arrive.'
      );
    case 'refund_due':
      return (
        `We'll send ${refund} of your deposit back to you by bank transfer. ` +
        "Please reply to this email with the account you'd like it paid into."
      );
    case 'refund_failed':
      return `We'll refund ${refund} of your deposit to you shortly.`;
    case 'forfeited':
      return (
        `As you cancelled less than ${config.payments.freeCancellationHours} hours before your appointment, ` +
        "your deposit isn't refunded."
      );
    default:
      return '';
  }
}

function buildCustomerCancelledClientEmail(booking) {
  const refundMessage = cancelledRefundMessage(booking);
  return {
    from: config.email.from,
    to: booking.client_email,
    replyTo: config.salon.email || config.email.adminEmail,
    subject: `Booking cancelled: ${booking.service_name} on ${formatDateTime(booking.start_time)}`,
    html: layout(
      'Your appointment is cancelled',
      `<p style="margin:0 0 16px;">Hi ${escapeHtml(booking.client_name)}, as you asked, we've cancelled this appointment.</p>
       ${refundMessage ? `<p style="margin:0 0 16px;"><strong>${escapeHtml(refundMessage)}</strong></p>` : ''}
       ${detailsTable(booking)}
       ${button(`${config.publicUrl}/book?serviceId=${booking.service_id}`, 'Book another time')}`
    ),
    text: [
      `Hi ${booking.client_name}, as you asked, we've cancelled this appointment.`,
      refundMessage,
      `Booking #${booking.id}`,
      `Service: ${booking.service_name}`,
      `When: ${formatDateTime(booking.start_time)}`,
      depositText(booking),
      `Book another time: ${config.publicUrl}/book?serviceId=${booking.service_id}`,
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

/** Tells the customer the salon changed the status of their booking */
async function sendStatusEmail(booking) {
  if (!STATUS_MESSAGES[booking.status]) return false;
  await transporter.sendMail(buildUpdateEmail(booking, STATUS_MESSAGES[booking.status]));
  return true;
}

/** Tells the customer the salon received their transfer deposit, or sent their refund */
async function sendDepositEmail(booking, action) {
  if (!DEPOSIT_MESSAGES[action]) return false;
  await transporter.sendMail(buildUpdateEmail(booking, DEPOSIT_MESSAGES[action]));
  return true;
}

/** Tells the customer their payment came in after the slot was released and is being refunded */
async function sendLatePaymentEmail(booking) {
  await transporter.sendMail(buildUpdateEmail(booking, LATE_PAYMENT_MESSAGE));
  return true;
}

async function sendRescheduleEmails(booking, previousStart) {
  await Promise.all([
    transporter.sendMail(buildRescheduleAdminEmail(booking, previousStart)),
    transporter.sendMail(buildRescheduleClientEmail(booking)),
  ]);
}

// The client cancelled: tell the salon, and confirm it to the client (with what happens to their deposit)
async function sendCustomerCancelledEmail(booking) {
  await Promise.all([
    transporter.sendMail(buildCustomerCancelledAdminEmail(booking)),
    transporter.sendMail(buildCustomerCancelledClientEmail(booking)),
  ]);
}

async function sendPasswordResetEmail(user, resetUrl) {
  await transporter.sendMail({
    from: config.email.from,
    to: user.email,
    subject: `Reset your ${config.salon.name} password`,
    html: layout(
      'Reset your password',
      `<p style="margin:0 0 16px;">Hi ${escapeHtml(user.full_name)}, we received a request to reset your password.
         Click the button below to choose a new one. The link works once and expires in 1 hour.</p>
       ${button(resetUrl, 'Choose a new password')}
       <p style="margin:16px 0 0;font-size:13px;color:${COLORS.muted};">
         Didn't ask for this? You can ignore this email; your password stays the same.
       </p>`
    ),
    text: [
      `Hi ${user.full_name}, we received a request to reset your password.`,
      `Choose a new one here (works once, expires in 1 hour): ${resetUrl}`,
      "Didn't ask for this? Ignore this email; your password stays the same.",
    ].join('\n'),
  });
}

// A message from the Contact page, to the salon; replying goes straight to the client
async function sendContactMessage({ name, email, phone, message }) {
  await transporter.sendMail({
    from: config.email.from,
    to: config.salon.email || config.email.adminEmail,
    replyTo: email,
    subject: `Website message from ${name}`,
    html: layout(
      'New message from the website',
      `<p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(message)}</p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:${COLORS.muted};">
         ${escapeHtml(name)}<br/>${escapeHtml(email)}${phone ? `<br/>${escapeHtml(phone)}` : ''}
       </p>
       <p style="margin:16px 0 0;font-size:13px;color:${COLORS.muted};">Reply to this email to answer ${escapeHtml(name)}.</p>`
    ),
    text: [message, '', `${name} <${email}>${phone ? ` ${phone}` : ''}`].join('\n'),
  });
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
  sendDepositEmail,
  sendLatePaymentEmail,
  sendRescheduleEmails,
  sendCustomerCancelledEmail,
  sendPasswordResetEmail,
  sendContactMessage,
  verifyEmailTransport,
};
