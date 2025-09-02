// --- static maps -----------------------------------------------------------
const IOS_RESOLUTION_TO_MODEL = new Map([
  // width×height in *physical* pixels (portrait order) ➜ model(s)
  ['640x960', 'iPhone 4 / 4 S'],
  ['640x1136', 'iPhone 5 / 5 S / SE 1'],
  ['750x1334', 'iPhone 6 / 6 S / 7 / 8 / SE 2'],
  ['828x1792', 'iPhone 11 / XR'],
  ['1080x2340', 'iPhone 12 / 13 / 14 / 15'],
  ['1125x2436', 'iPhone X / XS / 11 Pro'],
  ['1170x2532', 'iPhone 12 / 13 Pro / 14'],
  ['1242x2688', 'iPhone XS Max / 11 Pro Max'],
  ['1284x2778', 'iPhone 12 Pro Max / 13 Pro Max / 14 Plus'],
  ['1290x2796', 'iPhone 15 Pro Max'],
  ['1668x2388', 'iPad (10.5″ / 11″)'],
  ['2048x2732', 'iPad Pro 12.9″'],
]);

const DESKTOP_PLATFORM_TO_NAME = new Map([
  ['Win32', 'Windows'],
  ['Linux', 'Linux'],
  ['MacIntel', 'macOS'],
]);

const BROWSER_REGEXES = [
  { name: 'Firefox', re: /Firefox\/([\d.]+)/ }, // group1 = version
  { name: 'Edge', re: /Edg\/([\d.]+)/ }, // Chromium Edge :contentReference[oaicite:2]{index=2}
  { name: 'Opera', re: /OPR\/([\d.]+)/ }, // Opera :contentReference[oaicite:3]{index=3}
  { name: 'Chrome', re: /Chrome\/([\d.]+)/ },
  // Safari uses 'Version/xx.xx Safari'
  { name: 'Safari', re: /Version\/([\d.]+).*Safari/ },
];
// --- helpers ---------------------------------------------------------------
const memo = { deviceName: null };

const normaliseResolution = () => {
  // Ensure portrait‑ordered physical‑pixel key, e.g. "750x1334"
  const dpr = Math.round(window.devicePixelRatio || 1);
  const w = Math.round(window.screen.width * dpr);
  const h = Math.round(window.screen.height * dpr);
  const [min, max] = w < h ? [w, h] : [h, w];
  return `${min}x${max}`;
};

const getIosDeviceName = () => {
  return IOS_RESOLUTION_TO_MODEL.get(normaliseResolution()) ?? 'iOS device';
};

const getAndroidDeviceName = () => {
  // Modern: UA‑CH exposes the exact model string (not in all browsers yet)
  if (navigator.userAgentData?.model) {
    return navigator.userAgentData.model;
  }
  // Fallback: parse the legacy UA string once
  const match = /Android[^;]*;\s*([^;)]+)/i.exec(navigator.userAgent);
  return match ? match[1].trim().split(' ')[0] : 'Android device';
};

const getDesktopDeviceName = () => {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Unknown';
  return DESKTOP_PLATFORM_TO_NAME.get(platform) ?? platform;
};
// --- browser + OS helpers ----------------------------------------------

/**
 * Best-effort browser detection.
 * (UA-CH first, UA string fallback.)
 */
const getBrowserInfo = () => {
  // 1  Prefer UA-CH if it’s there
  if (navigator.userAgentData?.brands?.length) {
    const brand =
      navigator.userAgentData.brands.find(b => b.brand !== 'Not A Brand') || navigator.userAgentData.brands[0];
    return `${brand.brand}${brand.version.split('.')[0]}`; // major only  :contentReference[oaicite:4]{index=4}
  }

  // 2  Legacy UA-string fallback
  const ua = navigator.userAgent;
  for (const { name, re } of BROWSER_REGEXES) {
    const m = re.exec(ua);
    if (m) return `${name}${m[1].split('.')[0]}`; // major only
  }
  return 'UnknownBrowser';
};

const getOsInfo = () => {
  // UA-CH – major.minor.build
  if (navigator.userAgentData?.platform) {
    const name = navigator.userAgentData.platform;
    if (navigator.userAgentData.getHighEntropyValues) {
      try {
        const { platformVersion } = navigator.userAgentData.getHighEntropyValues
          ? /* eslint-disable-next-line no-await-in-loop */
            navigator.userAgentData.getHighEntropyValues(['platformVersion'])
          : { platformVersion: '' };
        if (platformVersion) {
          return `${name} ${platformVersion.split('.')[0]}`;
        }
      } catch {
        return name;
      }
    }
    return name;
  }

  const ua = navigator.userAgent;

  // macOS
  let m = /Mac OS X ([0-9_.]+)/.exec(ua);
  if (m) return `macOS${m[1].replace(/_/g, '.')}`;

  // Windows
  m = /Windows NT ([0-9.]+)/.exec(ua);
  if (m) {
    const map = { '10.0': '10', 6.3: '8.1', 6.2: '8', 6.1: '7' };
    return `Windows${map[m[1]] ?? m[1]}`;
  }

  // iOS
  m = /OS ([0-9_]+) like Mac OS X/.exec(ua);
  if (m) return `iOS${m[1].replace(/_/g, '.')}`;

  // Android
  m = /Android ([0-9.]+)/.exec(ua);
  if (m) return `Android${m[1]}`;

  // Linux/other :)
  return 'UnknownOS';
};

// --- public ----
export const getDeviceNameHelper = () => {
  if (memo.deviceName) return memo.deviceName;

  const isMobile = navigator.userAgentData ? navigator.userAgentData.mobile : /mobi|android/i.test(navigator.userAgent);

  const device = isMobile
    ? /android/i.test(navigator.userAgent)
      ? getAndroidDeviceName()
      : getIosDeviceName()
    : getDesktopDeviceName(); // e.g. "macOS" / "Windows"

  const osInfo = getOsInfo(); // "macOS 14.4"
  const browserInfo = getBrowserInfo(); // "Chrome 124"

  memo.deviceName = `${device === osInfo ? osInfo : device}_${browserInfo}`;
  // Example:  "macOS 14.4 – Chrome 124"
  //           "iPhone 15 Pro Max – Safari 17"

  return memo.deviceName;
};

export const openMultiFilePicker = callback => {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.style.display = 'none';

  input.addEventListener('change', event => {
    const files = event.target.files;
    if (callback && typeof callback === 'function') {
      callback(files);
    }
    document.body.removeChild(input);
  });

  document.body.appendChild(input);
  input.click();
};
