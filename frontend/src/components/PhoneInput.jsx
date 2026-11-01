import { useMemo, useState } from 'react';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js/mobile';

const DEFAULT_COUNTRY = 'NG';

function flag(country) {
  return String.fromCodePoint(...[...country].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

// Nigeria first, then every other country by name
function countryOptions() {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const all = getCountries().map((code) => ({
    code,
    label: `${flag(code)} ${names.of(code) || code} (+${getCountryCallingCode(code)})`,
    name: names.of(code) || code,
  }));
  all.sort((a, b) => (a.code === DEFAULT_COUNTRY ? -1 : b.code === DEFAULT_COUNTRY ? 1 : a.name.localeCompare(b.name)));
  return all;
}

/**
 * WhatsApp number field: a country-code picker plus the number, checked against that country's mobile
 * number rules. Calls onChange with the full international number ("+2348012345678") when it's valid,
 * or with what was typed otherwise; an invalid number blocks the form from submitting.
 */
export default function PhoneInput({ value, onChange, required }) {
  const options = useMemo(countryOptions, []);
  const initial = value ? parsePhoneNumberFromString(value, DEFAULT_COUNTRY) : null;
  const [country, setCountry] = useState(initial?.country || DEFAULT_COUNTRY);
  const [number, setNumber] = useState(initial ? initial.formatNational() : '');

  const parsed = number.trim() ? parsePhoneNumberFromString(number, country) : null;
  const valid = Boolean(parsed?.isValid());
  const example = country === 'NG' ? '0801 234 5678' : 'Mobile number';

  function emit(nextCountry, nextNumber) {
    const p = nextNumber.trim() ? parsePhoneNumberFromString(nextNumber, nextCountry) : null;
    onChange(p?.isValid() ? p.number : nextNumber.trim() ? `+${getCountryCallingCode(nextCountry)} ${nextNumber}` : '');
  }

  function handleNumber(e) {
    let next = e.target.value;
    let nextCountry = country;
    // A pasted "+44 7911…" picks its own country
    if (next.trim().startsWith('+')) {
      const p = parsePhoneNumberFromString(next);
      if (p?.country) {
        nextCountry = p.country;
        next = p.formatNational();
        setCountry(nextCountry);
      }
    }
    setNumber(next);
    emit(nextCountry, next);
  }

  function handleCountry(e) {
    setCountry(e.target.value);
    emit(e.target.value, number);
  }

  function setValidity(input) {
    if (!input) return;
    input.setCustomValidity(
      number.trim() && !valid
        ? `That doesn't look like a complete ${options.find((o) => o.code === country)?.name || ''} mobile number. Please check it.`
        : ''
    );
  }

  return (
    <div className="phone-input">
      <div className="phone-input-fields">
        <select value={country} onChange={handleCountry} aria-label="Country code" autoComplete="tel-country-code">
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          ref={setValidity}
          type="tel"
          inputMode="tel"
          value={number}
          onChange={handleNumber}
          autoComplete="tel-national"
          placeholder={example}
          maxLength={20}
          required={required}
          aria-invalid={number.trim() && !valid ? true : undefined}
        />
      </div>
      {valid ? (
        <span className="phone-input-hint phone-input-ok">✓ We'll message you on WhatsApp at {parsed.formatInternational()}</span>
      ) : number.trim() ? (
        <span className="phone-input-hint phone-input-error">Enter your full mobile number, e.g. {country === 'NG' ? '0801 234 5678' : 'with all its digits'}</span>
      ) : (
        <span className="phone-input-hint">Use your WhatsApp number: booking updates are sent there.</span>
      )}
    </div>
  );
}
