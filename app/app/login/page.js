'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '../lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/comando')
    router.refresh()
  }

  return (
    <div className="login-page">
      <div className="login-bg-grid" />
      <div className="login-container">

        {/* Left panel — branding (unchanged) */}
        <div className="login-brand">
          <div className="login-brand-logo">
            <div className="login-logo-icon">PO</div>
            <div>
              <div className="login-logo-text">POCI</div>
              <div className="login-logo-sub">Plataforma de Coordenação de Incêndios</div>
            </div>
          </div>
          <div className="login-brand-body">
            <div className="login-brand-headline">
              Quadro comum de situação para o combate a incêndios rurais
            </div>
            <div className="login-brand-desc">
              A POCI centraliza a informação operacional — incidentes, unidades,
              zonas táticas e meteorologia — numa plataforma única acessível a
              todas as entidades de comando.
            </div>
            <div className="login-feature-list">
              <div className="login-feature"><span className="login-feature-dot dot-red" />Mapa operacional em tempo real</div>
              <div className="login-feature"><span className="login-feature-dot dot-orange" />GPS de unidades e meios aéreos</div>
              <div className="login-feature"><span className="login-feature-dot dot-blue" />Alertas e comunicação à população</div>
              <div className="login-feature"><span className="login-feature-dot dot-green" />Meteorologia associada a cada ocorrência</div>
            </div>
          </div>
          <div className="login-brand-footer">
            Projeto independente em fase de demonstração · Não utilizado em operações reais
          </div>
        </div>

        {/* Right panel — email/password form */}
        <div className="login-auth">
          <div className="login-auth-card">
            <div className="login-auth-title">Acesso restrito</div>
            <div className="login-auth-sub">
              Esta plataforma é reservada a equipas de comando, entidades de
              Proteção Civil e parceiros autorizados.
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                className="form-input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <input
                className="form-input"
                type="password"
                placeholder="Palavra-passe"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              {error && (
                <div style={{ color: 'var(--accent-red)', fontSize: '13px' }}>{error}</div>
              )}
              <button className="login-entra-btn" type="submit" disabled={loading}>
                {loading ? 'A entrar...' : 'Entrar'}
              </button>
            </form>

            <div className="login-auth-divider"><span>ou</span></div>
            <Link href="/publico" className="login-public-btn">Ver vista pública</Link>
          </div>
        </div>

      </div>
    </div>
  )
}
