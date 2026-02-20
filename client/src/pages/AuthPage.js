import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { generateKeyPair, encryptPrivateKey } from '../utils/crypto';

const AuthPage = () => {
  const { login, register, loading } = useAuth();
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('Decrypting your keys…');
    const res = await login(form.username.trim(), form.password);
    setStatus('');
    if (!res.success) setError(res.message);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (form.username.trim().length < 3) return setError('Username must be 3+ characters');
    if (form.password.length < 8) return setError('Passphrase must be 8+ characters');
    if (form.password !== form.confirm) return setError('Passphrases do not match');

    setStatus('Generating RSA-2048 key pair…');
    try {
      const { publicKey, privateKey } = await generateKeyPair();
      setStatus('Encrypting private key…');
      const encryptedPrivateKey = await encryptPrivateKey(privateKey, form.password);
      setStatus('Creating account…');
      const res = await register(form.username.trim(), form.password, publicKey, encryptedPrivateKey);
      setStatus('');
      if (!res.success) setError(res.message);
    } catch (err) {
      setStatus('');
      setError('Key generation failed: ' + err.message);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <div style={styles.logoIcon}>🔐</div>
          <div style={styles.logoTitle}>
            Cipher<span style={{ color: '#00e5ff' }}>Chat</span>
          </div>
          <div style={styles.logoSub}>End-to-End Encrypted Messaging</div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {['login', 'register'].map((t) => (
            <button
              key={t}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => { setTab(t); setError(''); setStatus(''); }}
            >
              {t === 'login' ? 'Login' : 'Register'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={tab === 'login' ? handleLogin : handleRegister} style={styles.form}>
          <Field label="Username" name="username" value={form.username} onChange={handleChange} placeholder="your_username" />
          <Field label="Passphrase" name="password" type="password" value={form.password} onChange={handleChange} placeholder="••••••••••••" />
          {tab === 'register' && (
            <Field label="Confirm Passphrase" name="confirm" type="password" value={form.confirm} onChange={handleChange} placeholder="Repeat passphrase" />
          )}

          {status && <div style={styles.status}>{status}</div>}
          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.btn} disabled={loading}>
            {loading ? 'Please wait…' : tab === 'login' ? 'Unlock & Enter →' : 'Generate Keys & Register →'}
          </button>
        </form>

        {/* Security note */}
        <div style={styles.note}>
          <span style={{ color: '#10b981' }}>✦ AES-256-GCM</span> · <span style={{ color: '#10b981' }}>✦ RSA-2048</span>
          <br />
          Your private key never leaves your device unencrypted
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, name, type = 'text', value, onChange, placeholder }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={styles.label}>{label}</div>
    <input
      style={styles.input}
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete="off"
      required
    />
  </div>
);

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse at 30% 20%, rgba(124,58,237,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(0,229,255,0.06) 0%, transparent 60%), #0a0a0f',
    fontFamily: "'JetBrains Mono', monospace",
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    animation: 'fadeUp 0.5s ease',
  },
  logo: { textAlign: 'center', marginBottom: 40 },
  logoIcon: { fontSize: 48, marginBottom: 10, filter: 'drop-shadow(0 0 20px rgba(0,229,255,0.5))' },
  logoTitle: { fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, color: '#e2e8f0' },
  logoSub: { fontSize: 11, color: '#64748b', marginTop: 6, letterSpacing: 2, textTransform: 'uppercase' },
  tabs: { display: 'flex', border: '1px solid #252535', borderRadius: 10, overflow: 'hidden', marginBottom: 28, background: '#111118' },
  tab: { flex: 1, padding: 12, background: 'none', border: 'none', color: '#64748b', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, cursor: 'pointer', letterSpacing: 1, textTransform: 'uppercase' },
  tabActive: { background: '#252535', color: '#00e5ff' },
  form: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: 10, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  input: { width: '100%', padding: '13px 16px', background: '#16161f', border: '1px solid #252535', borderRadius: 8, color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  btn: { padding: 14, background: 'linear-gradient(135deg, #7c3aed, #00e5ff)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  error: { color: '#ef4444', fontSize: 11, textAlign: 'center', marginBottom: 8 },
  status: { color: '#10b981', fontSize: 11, textAlign: 'center', marginBottom: 8 },
  note: { textAlign: 'center', fontSize: 10, color: '#334155', marginTop: 20, lineHeight: 1.8 },
};

export default AuthPage;
