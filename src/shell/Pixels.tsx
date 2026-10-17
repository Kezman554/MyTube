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
