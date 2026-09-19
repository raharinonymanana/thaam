/** The Thaam mark (D134), inlined rather than loaded as an <img> so that
 * fill="currentColor" inherits from CSS - the mark is Jade in light and the
 * lighter jade in dark, and an <img> would be stuck with one of the two.
 *
 * Decorative: the wordmark beside it carries the name, so this is hidden from
 * screen readers. Vectorised from the owner's artwork; the strokes are fine,
 * so nothing below 32 px in the masthead.
 */
export default function LogoMark({ size = 36, className }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="264 270 732 732"
      aria-hidden="true"
      focusable="false"
    >
      <g
        transform="translate(0,1254) scale(0.1,-0.1)"
        fill="currentColor"
        stroke="none"
      >
        <path d="M6700 8675 c-293 -59 -548 -284 -651 -574 -112 -316 -28 -680 212 -920 267 -268 674 -334 1012 -165 605 303 657 1156 94 1531 -183 122 -446 173 -667 128z" />
        <path d="M8904 7137 c-110 -53 -159 -128 -344 -532 -188 -410 -374 -728 -545 -935 -191 -229 -345 -320 -543 -320 l-66 0 72 43 c338 203 567 512 1019 1375 136 261 -83 388 -286 166 -73 -80 -138 -191 -313 -534 -175 -344 -269 -504 -373 -635 -190 -238 -354 -335 -544 -322 -76 5 -256 39 -267 49 -2 3 42 21 99 42 465 170 793 466 792 716 -1 197 -155 260 -450 185 -305 -77 -626 -94 -1075 -55 -585 49 -829 17 -1167 -156 -421 -215 -701 -478 -1268 -1190 -131 -164 -290 -364 -354 -444 -64 -80 -147 -182 -185 -228 -38 -45 -66 -86 -62 -89 9 -9 170 75 271 142 205 133 304 222 780 700 574 577 664 656 909 804 297 179 499 223 924 203 608 -30 850 -11 1255 100 91 24 158 38 173 34 75 -19 40 -120 -82 -235 -148 -141 -310 -225 -684 -356 -208 -73 -299 -126 -336 -196 -36 -70 -32 -72 396 -173 897 -210 1164 -169 1593 244 257 247 437 503 652 925 249 491 274 573 202 652 -45 49 -116 56 -193 20z" />
        <path d="M9395 6861 c-122 -30 -194 -113 -310 -357 -281 -591 -541 -978 -895 -1335 -286 -288 -520 -432 -810 -495 -134 -30 -451 -25 -730 10 -260 33 -658 46 -841 27 -554 -57 -1024 -344 -1397 -849 -70 -95 -129 -202 -111 -202 30 0 149 78 358 235 252 190 357 263 501 347 421 247 768 291 1435 183 600 -98 906 -71 1270 110 519 258 1042 853 1502 1710 147 273 211 433 200 501 -11 64 -87 133 -137 123 -3 -1 -18 -4 -35 -8z" />
      </g>
    </svg>
  );
}
