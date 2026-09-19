/** The only icon set in the app (D131).
 *
 * Lucide geometry, pasted as path data rather than pulled from a package: the
 * seventeen icons below are a few hundred bytes, an icon dependency is tens of
 * kilobytes, and nothing here may be fetched from someone else's server.
 *
 * Every icon is decoration beside a word - never the only carrier of meaning -
 * so all of them are aria-hidden and the label next to them does the talking.
 */

// name -> the <path d="..."> list, in Lucide's 24x24 grid. Circles and rects
// from the originals are written out as path data so one renderer covers all.
// The map is data, and the icon test reads it without a DOM; losing fast
// refresh on this one file is the cheaper half of that trade.
// eslint-disable-next-line react/only-export-components
export const ICONS = {
  phone: [
    "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
  ],
  check: ["M20 6 9 17l-5-5"],
  "circle-check": [
    "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    "m9 12 2 2 4-4",
  ],
  "shield-check": [
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    "m9 12 2 2 4-4",
  ],
  scale: [
    "m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z",
    "m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z",
    "M7 21h10",
    "M12 3v18",
    "M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2",
  ],
  "trash-2": [
    "M3 6h18",
    "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
    "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
    "M10 11v6",
    "M14 11v6",
  ],
  "image-plus": [
    "M16 5h6",
    "M19 2v6",
    "M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5",
    "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",
    "M11 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  ],
  camera: [
    "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
    "M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  ],
  "lock-keyhole": [
    "M13 16a1 1 0 1 1-2 0 1 1 0 0 1 2 0",
    "M5 10h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2",
    "M7 10V7a5 5 0 0 1 10 0v3",
  ],
  clock: [
    "M12 6v6l4 2",
    "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  ],
  bell: [
    "M10.268 21a2 2 0 0 0 3.464 0",
    "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
  ],
  users: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  "file-text": [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",
    "M14 2v4a2 2 0 0 0 2 2h4",
    "M10 9H8",
    "M16 13H8",
    "M16 17H8",
  ],
  copy: [
    "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z",
    "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
  ],
  "chevron-down": ["m6 9 6 6 6-6"],
  "arrow-left": [
    "m12 19-7-7 7-7",
    "M19 12H5",
  ],
  "circle-alert": [
    "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    "M12 8v4",
    "M12 16h.01",
  ],
};

/** <Icon name="phone" size={20} />. An unknown name draws nothing, so a typo
 * leaves a gap rather than breaking the screen it sits on. */
export default function Icon({ name, size = 20, className }) {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
