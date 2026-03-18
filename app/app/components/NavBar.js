'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const NAV_LINKS = [
  { href: '/comando', label: 'Situação' },
  { href: '/meios',   label: 'Meios' },
  { href: '/radio',   label: 'Rádio' },
  { href: '/alertas', label: 'Alertas' },
  { href: '/relatorio', label: 'Relatório' },
]

export default function NavBar() {
  const pathname = usePathname()

  // Hide on public-facing page
  if (pathname?.startsWith('/publico')) return null

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="navbar-logo">
          <div className="logo-icon">PO</div>
          <span className="navbar-appname">POCI</span>
        </div>
      </div>

      <div className="navbar-center">
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`navbar-link ${pathname?.startsWith(href) ? 'navbar-link-active' : ''}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="navbar-right">
        <button className="btn btn-ghost btn-sm" onClick={() => signOut()}>
          Sair
        </button>
      </div>
    </nav>
  )
}
