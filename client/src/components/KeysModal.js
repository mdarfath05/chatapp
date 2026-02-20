import React, { useState, useEffect } from 'react';
import { getKeyFingerprint, toPEM } from '../utils/crypto';

const KeysModal = ({ user, onClose }) => {
  const [fingerprint, setFingerprint] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user?.publicKey) {
      getKeyFingerprint(user.publicKey).then(setFingerprint);
    }
  }, [user]);

  const pem = user?.publicKey ? toPEM(user.publicKey) : '';

  const copyKey = async () => {
    await navigator.clipboard.writeText(pem);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>🗝 Your Encryption Keys</h3>

        <div style={styles.label}>Public Key (share with contacts)</div>
        <pre style={styles.keyBox}>{pem}</pre>

        <div style={styles.label} css={{ marginTop: 16 }}>Key Fingerprint (SHA-256)</div>
        <pre style={{ ...styles.keyBox, color: '#10b981', fontSize: 11 }}>{fingerprint || 'Computing…'}</pre>

        <div style={styles.note}>
          Share your public key with contacts so they can send you encrypted messages.
          Your private key is stored encrypted on the server — only YOU can decrypt it with your passphrase.
        </div>

        <div style={styles.btns}>
          <button style={styles.btn} onClick={copyKey}>
            {copied ? '✓ Copied!' : 'Copy Public Key'}
          </button>
          <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: '#111118', border: '1px solid #252535', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, fontFamily: "'JetBrains Mono', monospace" },
  title: { fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 },
  label: { fontSize: 10, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  keyBox: { background: '#16161f', border: '1px solid #252535', borderRadius: 8, padding: 12, fontSize: 10, color: '#94a3b8', wordBreak: 'break-all', lineHeight: 1.8, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap', marginBottom: 16 },
  note: { fontSize: 11, color: '#475569', lineHeight: 1.7, marginBottom: 20 },
  btns: { display: 'flex', gap: 10 },
  btn: { flex: 1, padding: 11, background: 'linear-gradient(135deg, #7c3aed, #00e5ff)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 },
  btnGhost: { background: 'none', border: '1px solid #252535', color: '#64748b' },
};

export default KeysModal;
