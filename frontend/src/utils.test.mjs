import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountInWords, addDays, cleanPhone, inr, daysBetween } from './utils.js';

test('amountInWords uses Indian numbering', () => {
  assert.equal(amountInWords(0), 'Rupees Zero Only');
  assert.equal(amountInWords(1), 'Rupees One Only');
  assert.equal(amountInWords(5000), 'Rupees Five Thousand Only');
  assert.equal(amountInWords(11000), 'Rupees Eleven Thousand Only');
  assert.equal(amountInWords(12345.5), 'Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only');
  assert.equal(amountInWords(100000), 'Rupees One Lakh Only');
  assert.equal(amountInWords(125000), 'Rupees One Lakh Twenty Five Thousand Only');
  assert.equal(amountInWords(10000000), 'Rupees One Crore Only');
  assert.equal(amountInWords(99999999), 'Rupees Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Only');
  assert.equal(amountInWords(0.07), 'Rupees Zero and Seven Paise Only');
});

test('dates and phones', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-01', '2026-10-09'), 8);
  assert.equal(cleanPhone('+91 98765-43210'), '9876543210');
  assert.equal(cleanPhone('09876543210'), '9876543210');
  assert.equal(cleanPhone('12345'), '');
  assert.equal(inr(1234567), '₹12,34,567');
  assert.equal(inr(1500.5), '₹1,500.5');
});
