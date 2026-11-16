import type { ReactNode } from 'react'

// Iconițe mici, desenate inline, care moștenesc culoarea textului (currentColor).

interface IconProps {
  className?: string
}

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function ChevronIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 4l4 4-4 4" />
    </Icon>
  )
}

export function FolderIcon({ className, open = false }: IconProps & { open?: boolean }) {
  return (
    <Icon className={className}>
      {open ? (
        <path d="M1.75 12.5V4.25c0-.55.45-1 1-1h3.1l1.5 1.5h4.9c.55 0 1 .45 1 1v1.1M1.75 12.5l1.6-4.6c.14-.4.52-.65.94-.65h9.46c.69 0 1.17.68.94 1.33l-1.38 3.92H1.75z" />
      ) : (
        <path d="M1.75 4.25c0-.55.45-1 1-1h3.1l1.5 1.5h5.9c.55 0 1 .45 1 1v6.5c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1v-8z" />
      )}
    </Icon>
  )
}

export function FileIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M9.25 1.75H4.5c-.55 0-1 .45-1 1v10.5c0 .55.45 1 1 1h7c.55 0 1-.45 1-1V5l-3.25-3.25z" />
      <path d="M9.25 1.75V5h3.25" />
    </Icon>
  )
}

export function FilePlusIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M8.5 14.25h-4c-.55 0-1-.45-1-1V2.75c0-.55.45-1 1-1h4.75L12.5 5v3" />
      <path d="M9.25 1.75V5h3.25" />
      <path d="M12.25 10.25v4M10.25 12.25h4" />
    </Icon>
  )
}

export function FolderPlusIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M8 12.75H2.75c-.55 0-1-.45-1-1v-7.5c0-.55.45-1 1-1h3.1l1.5 1.5h5.9c.55 0 1 .45 1 1V8" />
      <path d="M12.25 9.75v4M10.25 11.75h4" />
    </Icon>
  )
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M2.5 4.25h11M6.25 4.25V2.75c0-.55.45-1 1-1h1.5c.55 0 1 .45 1 1v1.5" />
      <path d="M3.75 4.25l.6 8.6c.04.53.48.9 1 .9h5.3c.52 0 .96-.37 1-.9l.6-8.6M6.75 7v4.25M9.25 7v4.25" />
    </Icon>
  )
}
