// Usage: npm run whatsapp:test -- 08012345678
// Sends the booking-confirmed template with sample details, to check the WhatsApp setup end to end.
const config = require('../src/config');
const { sendConfirmationWhatsApp } = require('../src/services/whatsapp');

async function main() {
  const [phone] = process.argv.slice(2);
  if (!phone) {
    console.error('Usage: npm run whatsapp:test -- 08012345678');
    process.exit(1);
  }

  const result = await sendConfirmationWhatsApp({
    id: 0,
    status: 'confirmed',
    client_name: 'Test Client',
    client_phone: phone,
    service_name: 'Knotless Braids',
    start_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
    manage_token: 'test',
  });

  if (!result.sent) {
    console.error(`✖ Nothing sent: ${result.reason}`);
    process.exit(1);
  }
  console.log(`✔ Template "${config.whatsapp.templateName}" accepted by WhatsApp for +${result.to}. Check the phone.`);
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
