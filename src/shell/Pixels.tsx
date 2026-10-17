// Pixel-art marks on an 8×8 grid (DESIGN.md: crisp edges, never a smooth icon set).
// Colours come from tokens through the classes in shell.css.

// The MyTube mark: a purple block with a play arrow cut out of it.
export function LogoMark({ size }: { size: number }) {
  return (
    <svg className="pixel-logo" width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      <rect className="pixel-logo-block" width="8" height="8" />
      <path className="pixel-logo-arrow" d="M3 2 H4 V6 H3 Z M4 3 H5 V5 H4 Z" />
    </svg>
  )
}

// The channel avatar: the Enderman's black face and magenta eyes. Stays dark in light mode on purpose.
export function EnderFace({ size, label }: { size: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <rect className="pixel-face" width="8" height="8" />
      <rect className="pixel-eye" x="1" y="4" width="2" height="1" />
      <rect className="pixel-eye" x="5" y="4" width="2" height="1" />
      <rect className="pixel-glint" x="2" y="4" width="1" height="1" />
      <rect className="pixel-glint" x="5" y="4" width="1" height="1" />
    </svg>
  )
}

// Light and dark mode marks for the account menu's toggle, drawn in the button's text colour.
export function SunMark({ size }: { size: number }) {
  return (
    <svg className="pixel-mode" width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M3 0 H5 V1 H3 Z M3 7 H5 V8 H3 Z M0 3 H1 V5 H0 Z M7 3 H8 V5 H7 Z M2 2 H6 V6 H2 Z M1 1 H2 V2 H1 Z M6 1 H7 V2 H6 Z M1 6 H2 V7 H1 Z M6 6 H7 V7 H6 Z" />
    </svg>
  )
}

export function MoonMark({ size }: { size: number }) {
  return (
    <svg className="pixel-mode" width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M3 0 H6 V1 H3 Z M2 1 H4 V2 H2 Z M1 2 H3 V5 H1 Z M2 5 H4 V6 H2 Z M3 6 H6 V7 H3 Z M6 5 H7 V6 H6 Z" />
    </svg>
  )
}
