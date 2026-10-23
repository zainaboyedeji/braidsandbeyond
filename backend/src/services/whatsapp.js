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

/**
 * Sends the "booking confirmed" template through the WhatsApp Cloud API.
 * Business-initiated messages must use a template Meta has approved; its body takes these
 * parameters in order: {{1}} name, {{2}} service, {{3}} date & time, {{4}} booking #, {{5}} manage link.
 * Returns false (sends nothing) when WhatsApp isn't configured or the booking has no usable phone.
 */
async function sendConfirmationWhatsApp(booking) {
  if (!config.whatsapp.enabled || booking.status !== 'confirmed') return false;
  const to = toWhatsAppNumber(booking.client_phone);
  if (!to) return false;

  const params = [
    booking.client_name,
    // The pickup rides along in the service parameter, so the approved template doesn't need changing
    booking.pickup_hours
      ? `${booking.service_name} + ${booking.pickup_vehicle_name} pickup (${booking.pickup_hours} hours)`
      : booking.service_name,
    formatDateTime(booking.start_time),
    String(booking.id),
    manageUrl(booking),
  ];

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
          name: config.whatsapp.templateName,
          language: { code: config.whatsapp.templateLanguage },
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
        },
      }),
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp API ${res.status}: ${body.error?.message || res.statusText}`);
  }
  return true;
}

module.exports = {
  toWhatsAppNumber,
  sendConfirmationWhatsApp,
};
