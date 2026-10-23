import { useState } from 'react';
import { formatPrice } from '../utils/format';

// Bank details for paying a deposit by transfer, with copy buttons for the parts people type into their bank app
export default function TransferDetails({ booking, banks, currency }) {
  const [copied, setCopied] = useState('');
  const reference = `Booking ${booking.id}`;

  async function copy(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      // clipboard blocked: the value is on screen to copy by hand
    }
  }

  // A plain function (not a component) so the buttons aren't re-mounted on every render
  function copyButton(label, value) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(label, value)}>
        {copied === label ? 'Copied' : 'Copy'}
      </button>
    );
  }

  return (
    <div className="transfer-details">
      <strong>Pay your deposit by bank transfer</strong>
      <dl>
        <div>
          <dt>Amount</dt>
          <dd>
            {formatPrice(booking.deposit_cents, currency)}
            {copyButton('amount', String(booking.deposit_cents / 100))}
          </dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>
            {reference}
            {copyButton('reference', reference)}
          </dd>
        </div>
      </dl>
      {banks.length > 1 && <p className="small">Pay into any one of these accounts:</p>}
      {banks.map((bank) => (
        <dl key={bank.accountNumber} className="transfer-account">
          <div>
            <dt>Bank</dt>
            <dd>{bank.name}</dd>
          </div>
          <div>
            <dt>Account number</dt>
            <dd>
              {bank.accountNumber}
              {copyButton(bank.accountNumber, bank.accountNumber)}
            </dd>
          </div>
          <div>
            <dt>Account name</dt>
            <dd>{bank.accountName}</dd>
          </div>
        </dl>
      ))}
      <p className="muted small">
        Put the reference in the transfer narration. The salon confirms your booking once the deposit arrives.
      </p>
    </div>
  );
}
