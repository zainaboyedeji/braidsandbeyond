// Usage: npm run whatsapp:test -- 08012345678   (booking-confirmed template, to that phone)
//        npm run whatsapp:test -- --admin       (new-booking alert, to WHATSAPP_ADMIN_PHONE)
// Sends the template with sample details, to check the WhatsApp setup end to end.
const config = require('../src/config');
const { sendConfirmationWhatsApp, sendAdminBookingWhatsApp } = require('../src/services/whatsapp');

async function main() {
  const [arg] = process.argv.slice(2);
  if (!arg) {
    console.error('Usage: npm run whatsapp:test -- 08012345678   or   npm run whatsapp:test -- --admin');
    process.exit(1);
  }
  const admin = arg === '--admin';

  const sample = {
    id: 0,
    status: 'confirmed',
    client_name: 'Test Client',
    client_phone: admin ? '0801 234 5678' : arg,
    service_name: 'Knotless Braids',
    start_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
    manage_token: 'test',
  };
  const result = admin ? await sendAdminBookingWhatsApp(sample) : await sendConfirmationWhatsApp(sample);

  if (!result.sent) {
    console.error(`✖ Nothing sent: ${result.reason}`);
    process.exit(1);
  }
  const template = admin ? config.whatsapp.admin.templateName : config.whatsapp.templateName;
  console.log(`✔ Template "${template}" accepted by WhatsApp for +${result.to}. Check the phone.`);
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
