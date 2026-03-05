import { useState } from 'react';
import { signIn, signUp } from '../supabase';

const inp = {
  background: '#0d0f14', border: '1px solid #2d3148', borderRadius: 12,
  padding: '14px 16px', color: '#e8eaf0', fontFamily: 'inherit',
  fontSize: 15, outline: 'none', width: '100%',
};

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handle = async () => {
    if (!email || !password) { setError('Please fill in both fields.'); return; }
    setLoading(true); setError(''); setSuccess('');
    const fn = mode === 'login' ? signIn : signUp;
    const { data, error: err } = await fn(email, password);
    setLoading(false);
    if (err) { setError(err.message); return; }
    if (mode === 'signup') {
      setSuccess('Account created! Check your email to confirm, then log in.');
      setMode('login');
    } else {
      onAuth(data.user);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>TuitionDesk</div>
          <div style={{ fontSize: 14, color: '#4b5563', marginTop: 6 }}>Your tuition & finance tracker</div>
        </div>

        {/* Card */}
        <div style={{ background: '#1a1d27', borderRadius: 20, padding: 28, border: '1px solid #1e2030' }}>
          {/* Tab toggle */}
          <div style={{ display: 'flex', background: '#0d0f14', borderRadius: 12, padding: 4, marginBottom: 24 }}>
            {['login', 'signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setSuccess(''); }} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                background: mode === m ? '#818cf8' : 'transparent',
                color: mode === m ? '#fff' : '#6b7280', transition: 'all .2s',
              }}>{m === 'login' ? 'Log In' : 'Sign Up'}</button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <input style={inp} type="email" placeholder="Email address" value={email}
              onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handle()} />
            <input style={inp} type="password" placeholder="Password (min 6 chars)" value={password}
              onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handle()} />
          </div>

          {error && <div style={{ background: '#f8717122', border: '1px solid #f8717144', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 14 }}>{error}</div>}
          {success && <div style={{ background: '#22c55e22', border: '1px solid #22c55e44', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#22c55e', marginBottom: 14 }}>{success}</div>}

          <button onClick={handle} disabled={loading} style={{
            width: '100%', background: '#818cf8', border: 'none', borderRadius: 12,
            padding: '14px 0', color: '#fff', fontWeight: 800, fontSize: 16,
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            opacity: loading ? 0.7 : 1, transition: 'opacity .2s',
          }}>
            {loading ? '...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#4b5563' }}>
          Your data is synced securely across all devices
        </div>
      </div>
    </div>
  );
}
