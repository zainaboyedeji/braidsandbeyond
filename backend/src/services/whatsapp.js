const config = require('../config');

function formatDateTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: config.salon.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

function manageUrl(booking) {
  return `${config.publicUrl}/manage/${booking.manage_token}`;
}

/**
 * Turns what the customer typed ("0801 234 5678", "+234 801…", "00234…") into WhatsApp's
 * digits-only international format ("2348012345678"). Local numbers get the salon's country code.
 */
function toWhatsAppNumber(phone) {
  const raw = String(phone || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (raw.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = config.whatsapp.defaultCountryCode + digits.slice(1);
  } else if (!digits.startsWith(config.whatsapp.defaultCountryCode)) {
    digits = config.whatsapp.defaultCountryCode + digits;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** Values for the template's {{1}}–{{5}}, also used for the click-to-chat message. */
function messageParams(booking) {
  return [
    booking.client_name,
    // The pickup rides along in the service parameter, so the approved template doesn't need changing
    booking.pickup_vehicle_name
      ? `${booking.service_name} + ${booking.pickup_vehicle_name} pickup`
      : booking.service_name,
    formatDateTime(booking.start_time),
    String(booking.id),
    manageUrl(booking),
  ];
}

/**
 * wa.me link that opens WhatsApp on the admin's device with the confirmation already typed to the client.
 * Free fallback for when the Cloud API can't send (not set up, no billing yet, Meta error).
 * Null when the booking has no usable phone.
 */
function confirmationLink(booking) {
  const to = toWhatsAppNumber(booking.client_phone);
  if (!to) return null;
  const [name, service, when, id, link] = messageParams(booking);
  const text =
    `Hi ${name}, your booking at ${config.salon.name} is confirmed.\n\n` +
    `Service: ${service}\nDate & time: ${when}\nBooking number: #${id}\n\n` +
    `To view or change your booking, visit ${link}\n\nSee you soon!`;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/**
 * Sends an approved template through the WhatsApp Cloud API; `params` fill the body's {{1}}, {{2}}…
 * Business-initiated messages must use a template Meta has approved. Throws when Meta rejects the message.
 */
async function sendTemplate(to, templateName, params) {
  const res = await fetch(
    `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: config.whatsapp.templateLanguage },
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
        },
      }),
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const { message, code, error_data: data } = body.error || {};
    const details = data?.details ? ` (${data.details})` : '';
    throw new Error(`WhatsApp API ${res.status}${code ? ` #${code}` : ''}: ${message || res.statusText}${details}`);
  }
}

/**
 * Sends the "booking confirmed" template to the client. Its body takes these parameters in order:
 * {{1}} name, {{2}} service, {{3}} date & time, {{4}} booking #, {{5}} manage link.
 * Returns { sent, to } or, when nothing was sent, { sent: false, reason } so the admin can see why.
 * Throws when Meta rejects the message.
 */
async function sendConfirmationWhatsApp(booking) {
  if (booking.status !== 'confirmed') return { sent: false };
  if (!config.whatsapp.enabled) {
    return { sent: false, reason: 'WhatsApp is not set up on the server (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)' };
  }
  const to = toWhatsAppNumber(booking.client_phone);
  if (!to) {
    return {
      sent: false,
      reason: booking.client_phone ? `"${booking.client_phone}" is not a valid phone number` : 'the client left no phone number',
    };
  }

  await sendTemplate(to, config.whatsapp.templateName, messageParams(booking));
  return { sent: true, to };
}

/**
 * Alerts the salon's phone about a new booking request, with the "new booking" template. Its body takes:
 * {{1}} client name, {{2}} service, {{3}} date & time, {{4}} booking #, {{5}} client phone.
 * Returns { sent, to } or { sent: false, reason }. Throws when Meta rejects the message.
 */
async function sendAdminBookingWhatsApp(booking) {
  const { admin } = config.whatsapp;
  if (!config.whatsapp.enabled || !admin.phone || !admin.templateName) {
    return { sent: false, reason: 'salon alerts are not set up (WHATSAPP_ADMIN_PHONE / WHATSAPP_ADMIN_TEMPLATE_NAME)' };
  }
  const to = toWhatsAppNumber(admin.phone);
  if (!to) return { sent: false, reason: `WHATSAPP_ADMIN_PHONE "${admin.phone}" is not a valid phone number` };

  const [name, service, when, id] = messageParams(booking);
  await sendTemplate(to, admin.templateName, [name, service, when, id, booking.client_phone || 'no phone given']);
  return { sent: true, to };
}

/** Fire-and-forget wrapper: a failed alert is logged and never blocks the booking */
function notifyAdminOfBooking(booking) {
  sendAdminBookingWhatsApp(booking)
    .then((result) => {
      if (result.reason) console.warn(`Booking #${booking.id}: no salon WhatsApp alert, ${result.reason}`);
    })
    .catch((err) => console.error(`Booking #${booking.id}: salon WhatsApp alert failed:`, err.message));
}

module.exports = {
  toWhatsAppNumber,
  confirmationLink,
  sendConfirmationWhatsApp,
  sendAdminBookingWhatsApp,
  notifyAdminOfBooking,
};
