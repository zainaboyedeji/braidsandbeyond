const db = require('../db');
const { HttpError } = require('../utils/http');

const VEHICLE_FIELDS = 'id, tier, name, price_cents, is_active';

// Luxury first, then basic
const ORDER_BY = `ORDER BY CASE tier WHEN 'luxury' THEN 0 ELSE 1 END`;

async function getPickupVehicles({ activeOnly = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${VEHICLE_FIELDS} FROM pickup_vehicles ${activeOnly ? 'WHERE is_active' : ''} ${ORDER_BY}`
  );
  return rows;
}

function toCents(value, label) {
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 0) throw new HttpError(400, `${label} must be a non-negative whole amount`);
  return cents;
}

/** Admin: saves name, price and on/off for each vehicle: [{ id, name, priceCents, isActive }] */
async function setPickupVehicles(vehicles) {
  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    throw new HttpError(400, 'Send the list of pickup vehicles');
  }
  const clean = vehicles.map((v) => {
    const name = String(v.name || '').trim();
    if (name.length < 2 || name.length > 120) throw new HttpError(400, 'Vehicle name must be 2–120 characters');
    return {
      id: Number(v.id),
      name,
      price: toCents(v.priceCents, `${name}: price`),
      isActive: Boolean(v.isActive),
    };
  });

  await db.withTransaction(async (client) => {
    for (const v of clean) {
      const { rowCount } = await client.query(
        `UPDATE pickup_vehicles
            SET name = $1, price_cents = $2, is_active = $3
          WHERE id = $4`,
        [v.name, v.price, v.isActive, v.id]
      );
      if (rowCount === 0) throw new HttpError(404, 'Pickup vehicle not found');
    }
  });
  return getPickupVehicles();
}

/**
 * Validates the optional pickup add-on from the booking form: { vehicleId, address } or null.
 * Returns null for "no pickup", otherwise the cleaned request (price is looked up inside the booking transaction).
 */
function parsePickup(body) {
  if (!body || !body.vehicleId) return null;
  const vehicleId = Number(body.vehicleId);
  const address = String(body.address || '').trim();
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) throw new HttpError(400, 'Invalid pickup vehicle');
  if (address.length < 5 || address.length > 300) {
    throw new HttpError(400, 'Enter the pickup address (5–300 characters)');
  }
  return { vehicleId, address };
}

/** Locks the vehicle for the booking transaction and returns its price */
async function priceForPickup(client, pickup) {
  const { rows } = await client.query(
    `SELECT price_cents, is_active FROM pickup_vehicles WHERE id = $1 FOR SHARE`,
    [pickup.vehicleId]
  );
  const vehicle = rows[0];
  if (!vehicle || !vehicle.is_active) {
    throw new HttpError(400, 'That pickup option is no longer available');
  }
  return vehicle.price_cents;
}

module.exports = { getPickupVehicles, setPickupVehicles, parsePickup, priceForPickup };
