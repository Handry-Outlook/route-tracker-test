// Heart-rate and cadence sensors over Web Bluetooth.
//
// These are the two live metrics the mockup's LiveStats card shows that GPS
// alone cannot provide. Both use standard Bluetooth SIG profiles, so any
// off-the-shelf strap or cadence sensor works:
//   Heart Rate service      0x180D / measurement 0x2A37
//   Cycling Speed & Cadence 0x1816 / measurement 0x2A5B
//
// Web Bluetooth needs a user gesture and a secure context (https or
// localhost), and is unavailable on iOS Safari — callers must handle
// isSupported() === false rather than assume a reading.

const HR_SERVICE = 'heart_rate';
const HR_CHAR = 'heart_rate_measurement';
const CSC_SERVICE = 'cycling_speed_and_cadence';
const CSC_CHAR = 'csc_measurement';

const state = {
  heartRate: null,
  cadence: null,
  hrDevice: null,
  cscDevice: null,
  lastCrankRevs: null,
  lastCrankTime: null,
};

export function isSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export function getHeartRate() { return state.heartRate; }
export function getCadence() { return state.cadence; }
export function hrConnected() { return !!state.hrDevice?.gatt?.connected; }
export function cadenceConnected() { return !!state.cscDevice?.gatt?.connected; }

/** Heart-rate measurement: bit 0 of the flags byte picks 8- or 16-bit BPM. */
function parseHeartRate(view) {
  const flags = view.getUint8(0);
  return flags & 0x01 ? view.getUint16(1, true) : view.getUint8(1);
}

/**
 * CSC measurement: crank revolutions plus the time of the last crank event in
 * 1/1024 s. Cadence is the delta between two notifications, so the first
 * reading only establishes a baseline.
 */
function parseCadence(view) {
  const flags = view.getUint8(0);
  const hasCrank = flags & 0x02;
  if (!hasCrank) return null;
  // Wheel data (16 bytes) precedes crank data when present.
  const offset = flags & 0x01 ? 7 : 1;
  const revs = view.getUint16(offset, true);
  const time = view.getUint16(offset + 2, true);
  const prevRevs = state.lastCrankRevs;
  const prevTime = state.lastCrankTime;
  state.lastCrankRevs = revs;
  state.lastCrankTime = time;
  if (prevRevs === null || prevTime === null) return null;
  let dRev = revs - prevRevs;
  let dTime = time - prevTime;
  if (dRev < 0) dRev += 65536;   // 16-bit counters wrap
  if (dTime < 0) dTime += 65536;
  if (dTime <= 0) return state.cadence;
  const rpm = (dRev * 1024 * 60) / dTime;
  return rpm >= 0 && rpm < 250 ? Math.round(rpm) : state.cadence;
}

async function startNotifications(device, serviceName, charName, onValue) {
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(serviceName);
  const characteristic = await service.getCharacteristic(charName);
  await characteristic.startNotifications();
  characteristic.addEventListener('characteristicvaluechanged', (e) => onValue(e.target.value));
  return characteristic;
}

export async function connectHeartRate() {
  if (!isSupported()) throw new Error('Web Bluetooth is not available on this browser');
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [HR_SERVICE] }] });
  state.hrDevice = device;
  device.addEventListener('gattserverdisconnected', () => { state.heartRate = null; });
  await startNotifications(device, HR_SERVICE, HR_CHAR, (view) => {
    state.heartRate = parseHeartRate(view);
  });
  return device.name || 'Heart-rate monitor';
}

export async function connectCadence() {
  if (!isSupported()) throw new Error('Web Bluetooth is not available on this browser');
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [CSC_SERVICE] }] });
  state.cscDevice = device;
  state.lastCrankRevs = null;
  state.lastCrankTime = null;
  device.addEventListener('gattserverdisconnected', () => { state.cadence = null; });
  await startNotifications(device, CSC_SERVICE, CSC_CHAR, (view) => {
    const rpm = parseCadence(view);
    if (rpm !== null) state.cadence = rpm;
  });
  return device.name || 'Cadence sensor';
}

export function disconnectAll() {
  [state.hrDevice, state.cscDevice].forEach((d) => { try { d?.gatt?.disconnect(); } catch {} });
  state.hrDevice = state.cscDevice = null;
  state.heartRate = state.cadence = null;
}

/**
 * Heart-rate zone 1-5 from max HR (Tanaka: 208 - 0.7 * age). Without an age
 * the caller passes null and gets null back rather than a guessed zone.
 */
export function heartRateZone(bpm, age) {
  if (!Number.isFinite(bpm) || !Number.isFinite(age)) return null;
  const max = 208 - 0.7 * age;
  const pct = bpm / max;
  if (pct < 0.6) return 1;
  if (pct < 0.7) return 2;
  if (pct < 0.8) return 3;
  if (pct < 0.9) return 4;
  return 5;
}
