'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const NAV_LINKS = [
  { href: '/comando', label: 'Comando' },
  { href: '/meios',   label: 'Meios' },
  { href: '/radio',   label: 'Rádio' },
  { href: '/alertas', label: 'Alertas' },
  { href: '/relatorio', label: 'Relatório' },
  { href: '/demo', label: 'Demo' },
]

export default function NavBar() {
  const pathname = usePathname()

  // Minimal public navbar
  if (pathname?.startsWith('/publico')) return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="navbar-logo">
          <div className="logo-icon">PO</div>
          <span className="navbar-appname">POCI</span>
        </div>
      </div>
      <div className="navbar-right">
        <Link href="/login" className="btn btn-ghost btn-sm">Entrar</Link>
      </div>
    </nav>
  )

  function handleNovaOcorrencia() {
    if (pathname === '/comando') {
      window.dispatchEvent(new CustomEvent('poci:nova-ocorrencia'))
    } else {
      // Navigate to comando; user can place incident from there
      window.location.href = '/comando'
    }
  }

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
            className={`navbar-link ${(pathname === href || pathname?.startsWith(href + '/')) ? 'navbar-link-active' : ''}`}
            aria-current={(pathname === href || pathname?.startsWith(href + '/')) ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="navbar-right">
        <button className="btn btn-primary btn-sm" onClick={handleNovaOcorrencia}>
          + Nova Ocorrência
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => signOut()}>
          Sair
        </button>
      </div>
    </nav>
  )
}
