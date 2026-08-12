/**
 * Human-readable label for the device doing the scanning, written to
 * `scanner_device` on attendance, giveaway-claim and principal-arrival logs
 * alongside the descriptive values the other entry points already use
 * ('Web', 'Manual Input', 'Event Registration').
 *
 * Browsers never hand out marketing names — there is no way to read
 * "iPhone 16 Pro Max" from a web page. The best available per platform:
 *   - Android Chromium: the model code via User-Agent Client Hints
 *     ("SM-S928B"). Chrome's UA reduction froze the model in the UA string
 *     itself to the literal "K", so the hint API is the only source left.
 *   - Samsung Internet / older Chromium: the model is still in the UA string.
 *   - iOS: the family only. Safari reports "iPhone" and nothing more, by design.
 *   - Desktop: the OS release and browser, never hardware. Windows 10 and 11
 *     share one user agent, so telling them apart also needs Client Hints.
 * The label degrades down that list rather than guessing a model it cannot know.
 */

interface UADataValues {
  model?: string;
  platform?: string;
  platformVersion?: string;
}

interface NavigatorUAData {
  mobile: boolean;
  platform: string;
  getHighEntropyValues(hints: string[]): Promise<UADataValues>;
}

const getUAData = (): NavigatorUAData | undefined =>
  (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;

/**
 * Model codes whose maker can be read off the code itself. Only prefixes that
 * are unambiguous are listed — CPH, for instance, covers both OPPO and OnePlus
 * since the merger, so those codes are logged bare rather than mislabelled.
 */
const MODEL_VENDORS: Array<[RegExp, string]> = [
  [/^SM-/i, 'Samsung'],
  [/^GT-/i, 'Samsung'],
  [/^Pixel/i, 'Google'],
  [/^Nexus/i, 'Google'],
  [/^(moto|XT\d)/i, 'Motorola'],
  [/^(Redmi|POCO|Mi\s)/i, 'Xiaomi'],
  [/^RMX\d/i, 'realme'],
  [/^Lenovo/i, 'Lenovo'],
  [/^HUAWEI/i, 'Huawei']
];

/** Values that occupy the model slot without naming a device. */
const PLACEHOLDER_MODELS = new Set(['k', 'mobile', 'tablet', 'wv', 'unknown', 'generic', 'android']);

const joinParts = (parts: Array<string | null | undefined>) => parts.filter(Boolean).join(' · ');

/** Prefixes the maker when the code doesn't already spell it out. */
const formatModel = (raw?: string | null): string | null => {
  const model = raw?.replace(/\s+Build\/.*$/i, '').trim();
  if (!model || PLACEHOLDER_MODELS.has(model.toLowerCase())) return null;

  const vendor = MODEL_VENDORS.find(([pattern]) => pattern.test(model))?.[1];
  if (!vendor || model.toLowerCase().startsWith(vendor.toLowerCase())) return model;
  return `${vendor} ${model}`;
};

const appleOsVersion = (ua: string, name: string): string | null => {
  const match = /OS (\d+)[._](\d+)/.exec(ua);
  return match ? `${name} ${match[1]}.${match[2]}` : null;
};

const browserName = (ua: string): string | null => {
  if (/Edg(A|iOS)?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox';
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return null;
};

/** Everything derivable without awaiting Client Hints. */
const labelFromUserAgent = (): string => {
  const ua = navigator.userAgent;

  // iPadOS defaults to desktop-class browsing and reports itself as a Mac; the
  // touch-point count is the only reliable tell.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return joinParts(['iPad', appleOsVersion(ua, 'iPadOS')]);
  }
  if (/iPhone/.test(ua)) return joinParts(['iPhone', appleOsVersion(ua, 'iOS')]);
  if (/iPod/.test(ua)) return 'iPod touch';

  const android = /Android\s+([\d.]+)/.exec(ua);
  if (android) {
    const slot = /Android\s+[\d.]+;\s*([^);]+)/.exec(ua)?.[1]?.trim();
    const model = formatModel(slot);
    if (model) return model;

    // Chrome's reduced UA pins the whole tuple to "Android 10; K" whatever the
    // real device is, so that version number is not worth recording.
    const version = slot === 'K' ? null : android[1];
    return joinParts([version ? `Android ${version}` : 'Android', browserName(ua)]);
  }

  if (/Windows NT/.test(ua)) return joinParts(['Windows', browserName(ua)]);
  if (/CrOS/.test(ua)) return joinParts(['ChromeOS', browserName(ua)]);
  if (/Macintosh|Mac OS X/.test(ua)) return joinParts(['macOS', browserName(ua)]);
  if (/Linux|X11/.test(ua)) return joinParts(['Linux', browserName(ua)]);

  return browserName(ua) ?? 'Unknown device';
};

/**
 * Windows 11 kept the Windows 10 user agent — both report "Windows NT 10.0" —
 * so the hinted platform version is the only way to tell them apart. Microsoft
 * documents the mapping as: major 13 and up is Windows 11, 1 through 10 is
 * Windows 10, and 0 covers everything older.
 */
const windowsRelease = (platformVersion?: string): string => {
  const major = Number.parseInt(platformVersion?.split('.')[0] ?? '', 10);
  if (!Number.isFinite(major)) return 'Windows';
  if (major >= 13) return 'Windows 11';
  if (major >= 1) return 'Windows 10';
  return 'Windows 8.1 or older';
};

/** Desktop platforms carry no model, so the OS release is the useful part. */
const desktopFromHints = (platform?: string, platformVersion?: string): string | null => {
  if (platform === 'Windows') return windowsRelease(platformVersion);

  // Safari freezes the Mac UA at 10_15_7 forever; Chromium's hint is honest.
  const macMajor = platform === 'macOS' ? Number.parseInt(platformVersion?.split('.')[0] ?? '', 10) : NaN;
  if (Number.isFinite(macMajor) && macMajor > 0) return `macOS ${macMajor}`;

  return null;
};

const computeDeviceLabel = async (): Promise<string> => {
  const uaData = getUAData();

  if (uaData) {
    try {
      const { model, platform, platformVersion } = await uaData.getHighEntropyValues([
        'model',
        'platform',
        'platformVersion'
      ]);

      const named = formatModel(model);
      if (named) return named;

      // Android without a model means a browser that withholds it (Firefox);
      // the version is still worth more than the frozen UA string's.
      if (platform === 'Android' && platformVersion) {
        return joinParts([`Android ${platformVersion.split('.')[0]}`, browserName(navigator.userAgent)]);
      }

      const desktop = desktopFromHints(platform, platformVersion);
      if (desktop) return joinParts([desktop, browserName(navigator.userAgent)]);
    } catch {
      // Hints need a secure context and can be refused outright.
    }
  }

  return labelFromUserAgent();
};

let cachedLabel: string | null = null;
let pendingLabel: Promise<string> | null = null;

/**
 * Best label available without awaiting anything. Use it to seed state so a
 * scan landing in the first moments after mount still records a device, then
 * replace it with `resolveDeviceLabel()`.
 */
export const readDeviceLabelSync = (): string => cachedLabel ?? labelFromUserAgent();

/** The full label, including the Client Hints model where the browser allows it. */
export const resolveDeviceLabel = async (): Promise<string> => {
  if (cachedLabel) return cachedLabel;
  if (!pendingLabel) pendingLabel = computeDeviceLabel();
  cachedLabel = await pendingLabel;
  return cachedLabel;
};
