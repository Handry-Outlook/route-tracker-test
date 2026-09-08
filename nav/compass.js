// Device-compass heading, fused with GPS-course heading in legacy.js's
// updateTravelHeading(). GPS course-over-ground is accurate but undefined
// (or frozen) whenever the rider is stopped or moving slowly — exactly the
// case a magnetometer-based compass covers. Fusing the two removes the
// "heading freezes at red lights / junctions" gap the app had before.
//
// iOS 13+ gates deviceorientation behind a user-gesture permission prompt
// (DeviceOrientationEvent.requestPermission()); Android/desktop do not
// gate it at all, so enableCompass() handles both paths.

let compassHeading = null;
let compassAvailable = false;
let permissionState = 'unknown'; // 'unknown' | 'granted' | 'denied' | 'unsupported'

function handleOrientation(e) {
  let heading = null;
  if (typeof e.webkitCompassHeading === 'number') {
    heading = e.webkitCompassHeading; // iOS: already a true compass heading, 0 = north
  } else if (e.absolute && typeof e.alpha === 'number') {
    heading = (360 - e.alpha) % 360; // Android deviceorientationabsolute: alpha increases counter-clockwise
  }
  if (heading === null || !Number.isFinite(heading)) return;
  compassAvailable = true;
  if (compassHeading === null) {
    compassHeading = heading;
    return;
  }
  // Exponential moving average blended on the unit circle so the
  // 359°/1° wraparound never causes a spurious 358° jump.
  const alpha = 0.15;
  const a = (compassHeading * Math.PI) / 180;
  const b = (heading * Math.PI) / 180;
  const x = Math.cos(a) * (1 - alpha) + Math.cos(b) * alpha;
  const y = Math.sin(a) * (1 - alpha) + Math.sin(b) * alpha;
  compassHeading = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export async function enableCompass() {
  if (permissionState === 'granted' || permissionState === 'denied' || permissionState === 'unsupported') {
    return permissionState;
  }
  if (typeof DeviceOrientationEvent === 'undefined') {
    permissionState = 'unsupported';
    return permissionState;
  }
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      permissionState = result === 'granted' ? 'granted' : 'denied';
    } catch {
      permissionState = 'denied';
    }
  } else {
    permissionState = 'granted';
  }
  if (permissionState === 'granted') {
    addEventListener('deviceorientationabsolute', handleOrientation, true);
    addEventListener('deviceorientation', handleOrientation, true);
  }
  return permissionState;
}

export function getCompassHeading() {
  return compassHeading;
}

export function isCompassAvailable() {
  return compassAvailable;
}

export function getCompassPermissionState() {
  return permissionState;
}
