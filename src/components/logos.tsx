/*
 * Logos de marque, en ligne (aucune requête externe, compatible avec la CSP).
 * - LinkedIn : homarr-labs/dashboard-icons (svg/linkedin.svg), Apache License 2.0.
 * - Google : selfhst/icons (svg/google.svg), CC BY 4.0, © selfh.st.
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { taille?: number };

export function LogoLinkedIn({ taille = 18, ...props }: P) {
  return (
    <svg viewBox="0 0 512 512" width={taille} height={taille} aria-hidden focusable="false" {...props}>
      <path fill="#007ebb" fillRule="evenodd" d="M56.9 512h398.2c31.4 0 56.9-25.5 56.9-56.9V56.9C512 25.5 486.5 0 455.1 0H56.9C25.5 0 0 25.5 0 56.9v398.2C0 486.5 25.5 512 56.9 512" />
      <path fill="#fff" fillRule="evenodd" d="M440.9 440.9h-76V311.5c0-35.5-13.5-55.3-41.6-55.3-30.5 0-46.5 20.6-46.5 55.3v129.4h-73.2V194.4h73.2v33.2s22-40.7 74.3-40.7 89.7 31.9 89.7 98v156zM116.3 162.1c-24.9 0-45.2-20.4-45.2-45.5s20.2-45.5 45.2-45.5 45.1 20.4 45.1 45.5-20.2 45.5-45.1 45.5M78.5 440.9h76.4V194.4H78.5z" />
    </svg>
  );
}

export function LogoGoogle({ taille = 18, ...props }: P) {
  return (
    <svg viewBox="0 0 512 512" width={taille} height={taille} aria-hidden focusable="false" {...props}>
      <defs>
        <radialGradient id="logo-google-a" cx="91.998" cy="254.653" r="224.709" gradientTransform="matrix(.8032 0 0 -1.0842 -7.184 568.69)" gradientUnits="userSpaceOnUse">
          <stop offset=".368" stopColor="#ffcf09" />
          <stop offset=".718" stopColor="#ffcf09" stopOpacity=".7" />
          <stop offset="1" stopColor="#ffcf09" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="logo-google-b" cx="188.9" cy="-30.673" r="276.436" gradientTransform="matrix(1.317 -.1645 -.1248 -.9995 90.861 507.496)" gradientUnits="userSpaceOnUse">
          <stop offset=".383" stopColor="#34a853" />
          <stop offset=".706" stopColor="#34a853" stopOpacity=".7" />
          <stop offset="1" stopColor="#34a853" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="logo-google-c" x1="521.402" x2="255.847" y1="398.065" y2="71.945" gradientTransform="matrix(1 0 0 -1 0 514)" gradientUnits="userSpaceOnUse">
          <stop offset=".671" stopColor="#4285f4" />
          <stop offset=".885" stopColor="#4285f4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path fill="#fc4c53" d="M502.2 209.5H261.1v99.1h137.8c-6.1 31.9-24.2 58.9-51.4 77-22.8 15.4-51.9 24.7-86.3 24.7-66.6 0-123.1-44.9-143.4-105.4h-.3l.3-.2c-5.1-15.4-8.1-31.7-8.1-48.6s3-33.3 8.1-48.6C138 147 194.6 102.1 261.2 102.1c37.7 0 71.2 13 98 38.2L432.5 67C388 25.4 330.2 0 261.1 0 161 0 74.7 57.5 32.6 141.3 15.1 175.7 5.1 214.6 5.1 256s10 80.3 27.5 114.7v.2C74.7 454.5 161 512 261.1 512c69.1 0 127.1-22.8 169.4-61.9 48.4-44.7 76.3-110.3 76.3-188.3.1-18.1-1.5-35.6-4.6-52.3" />
      <path fill="url(#logo-google-a)" d="M117.8 304.9h-.3l.3-.2c-5.1-15.4-8.1-31.7-8.1-48.6 0-17 3-33.3 8.1-48.6 12.8-38.3 40.2-70.2 75.3-88.6C169 86.9 138.3 64 104 54.2c-29.7 23.3-54.3 52.9-71.5 87C15.1 175.7 5.1 214.6 5.1 256s10 80.3 27.5 114.7v.2c28.3 56 76.5 100.3 135.3 123.4 24.6-22.5 44.7-53 58.6-88.7-50.9-12.4-92.1-51.1-108.7-100.7" />
      <path fill="url(#logo-google-b)" d="M34.5 374.4C77.2 456.1 162.4 512 261.1 512c69.1 0 127.1-22.8 169.4-61.9 48.4-44.7 76.3-110.3 76.3-188.3 0-4.5-.4-8.7-.6-13.1-59-19.4-126.6-26.7-197.2-17.9-16.4 2-32.2 5.1-47.8 8.7v69.1H399c-6.1 31.9-24.2 58.9-51.4 77-22.8 15.4-51.9 24.7-86.3 24.7-66.6 0-123.1-44.9-143.4-105.4h-.3l.3-.2c-.5-1.5-.7-3.1-1.2-4.6-32.5 21.3-60.2 46.5-82.2 74.3" />
      <path fill="url(#logo-google-c)" d="M430.5 450.1c48.4-44.7 76.3-110.3 76.3-188.3 0-18.2-1.6-35.6-4.7-52.4h-241v99.1h137.8c-6.1 31.9-24.2 58.9-51.4 77-16.4 11-36.1 18.8-58.6 22.3l85.7 79.7c20.8-9.7 39.6-22.3 55.9-37.4" />
    </svg>
  );
}
