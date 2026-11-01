import type { ReactNode } from 'react'

export default function SectionHeading({
  children,
  aside,
}: {
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="section-heading">
      <h2>{children}</h2>
      {aside}
    </div>
  )
}
