'use client';

import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';

export default function CrmLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/crm/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        window.location.reload();
      } else {
        setError('Contraseña incorrecta');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
      <div className="w-full max-w-sm rounded-xl p-8" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg mb-4"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #db2777)' }}
          >
            S
          </div>
          <h1 className="text-xl font-bold text-white">Super Yo</h1>
          <p className="text-xs text-[#8888a0] mt-1">Sistema Personal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[#8888a0] font-medium mb-1.5">Contraseña</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555570]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresá la contraseña"
                className="w-full text-sm rounded-lg pl-9 pr-3 py-2.5 text-white placeholder-[#555570] focus:outline-none focus:ring-1 focus:ring-[#7c3aed]"
                style={{ backgroundColor: '#0a0a0f', border: '1px solid #2a2a3a' }}
                autoFocus
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #db2777)' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
