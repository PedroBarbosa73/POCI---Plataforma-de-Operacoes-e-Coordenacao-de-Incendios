'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSupabaseUser } from '../lib/useSupabaseUser'
import { getSupabase } from '../lib/supabase'

const NAV_LINKS = [
  { href: '/comando', label: 'Comando' },
  { href: '/meios',   label: 'Meios' },
  { href: '/radio',   label: 'Rádio' },
  { href: '/alertas', label: 'Alertas' },
  { href: '/relatorio', label: 'Relatório' },
  { href: '/demo', label: 'Demo' },
]

function UserChip() {
  const { user } = useSupabaseUser()
  if (!user) return null
  const name = user.email ?? 'Utilizador'
  const initials = name.split('@')[0].slice(0, 2).toUpperCase()
  return (
    <div className="navbar-user">
      <div className="navbar-avatar">{initials}</div>
      <span className="navbar-username">{name.split('@')[0]}</span>
    </div>
  )
}

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
        <UserChip />
        <button className="btn btn-ghost btn-sm" onClick={() => getSupabase().auth.signOut().then(() => window.location.href = '/login')}>
          Sair
        </button>
      </div>
    </nav>
  )
}
