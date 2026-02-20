import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import {
  encryptBackup,
  decryptBackup,
  getByteSize,
  formatBytes,
} from '../utils/backup';
import {
  authenticateGoogle,
  uploadToDrive,
  downloadFromDrive,
  listDriveBackups,
  isAuthenticated,
} from '../utils/googleDrive';

// ─── Main Modal ───────────────────────────────────────────────────────────────
const BackupModal = ({ user, onClose }) => {
  const [tab, setTab] = useState('backup'); // backup | restore
  const [backupHistory, setBackupHistory] = useState([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const { data } = await api.get('/backup/history');
      setBackupHistory(data);
    } catch {}
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>💾 Chat Backup</h3>
            <div style={styles.subtitle}>
              Backups are encrypted with your backup password
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {['backup', 'restore'].map((t) => (
            <button
              key={t}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {t === 'backup' ? '⬆ Backup' : '⬇ Restore'}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'backup' ? (
          <BackupTab user={user} backupHistory={backupHistory} onSuccess={fetchHistory} />
        ) : (
          <RestoreTab user={user} onSuccess={fetchHistory} />
        )}

        {/* Backup History */}
        {backupHistory.length > 0 && (
          <div style={styles.historySection}>
            <div style={styles.sectionLabel}>Last Backups</div>
            {backupHistory.map((b) => (
              <div key={b._id} style={styles.historyItem}>
                <span style={styles.historyIcon}>
                  {b.type === 'google_drive' ? '☁️' : '💾'}
                </span>
                <div style={styles.historyInfo}>
                  <div style={styles.historyType}>
                    {b.type === 'google_drive' ? 'Google Drive' : 'Local File'}
                  </div>
                  <div style={styles.historyMeta}>
                    {b.messageCount} messages · {formatBytes(b.sizeBytes)} ·{' '}
                    {new Date(b.lastBackupAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ ...styles.statusBadge, ...(b.status === 'completed' ? styles.statusOk : styles.statusFail) }}>
                  {b.status}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Security note */}
        <div style={styles.secNote}>
          🔐 Messages are end-to-end encrypted inside the backup.
          Your backup password adds a second layer of protection.
        </div>
      </div>
    </div>
  );
};

// ─── Backup Tab ───────────────────────────────────────────────────────────────
const BackupTab = ({ user, backupHistory, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [googleAuth, setGoogleAuth] = useState(false);

  const doBackup = async (type) => {
    setError('');
    if (!password) return setError('Enter a backup password');
    if (password.length < 6) return setError('Password must be 6+ characters');
    if (password !== confirm) return setError('Passwords do not match');

    setLoading(true);
    try {
      // Step 1: Get all messages from server
      setStatus('Fetching your messages…');
      const { data } = await api.post('/backup/generate');
      const { backupData, stats } = data;

      // Step 2: Encrypt the backup with backup password
      setStatus('Encrypting backup…');
      const encryptedContent = await encryptBackup(backupData, password);
      const sizeBytes = getByteSize(encryptedContent);

      if (type === 'local') {
        // Step 3a: Download as file
        setStatus('Preparing download…');
        const blob = new Blob([encryptedContent], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `cipherchat_${user.username}_${Date.now()}.cipherchat`;
        a.click();

        // Record backup
        await api.post('/backup/record', {
          type: 'local',
          messageCount: stats.totalMessages,
          contactCount: stats.totalContacts,
          sizeBytes,
        });

        setStatus('✓ Backup downloaded!');
        onSuccess();
      } else if (type === 'google_drive') {
        // Step 3b: Upload to Google Drive
        if (!isAuthenticated()) {
          setStatus('Connecting to Google Drive…');
          await authenticateGoogle();
          setGoogleAuth(true);
        }
        setStatus('Uploading to Google Drive…');
        const driveFileId = await uploadToDrive(encryptedContent, user.username);

        // Record backup
        await api.post('/backup/record', {
          type: 'google_drive',
          driveFileId,
          messageCount: stats.totalMessages,
          contactCount: stats.totalContacts,
          sizeBytes,
        });

        setStatus('✓ Backup uploaded to Google Drive!');
        onSuccess();
      }

      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message || 'Backup failed');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.tabContent}>
      <InfoBox
        icon="🔐"
        text="Your backup is encrypted with a backup password before being saved. You'll need this password to restore."
      />

      <Field label="Backup Password" type="password" value={password}
        onChange={(e) => setPassword(e.target.value)} placeholder="Create a backup password" />
      <Field label="Confirm Password" type="password" value={confirm}
        onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat backup password" />

      {status && <StatusMsg text={status} />}
      {error && <ErrorMsg text={error} />}

      <div style={styles.btnGroup}>
        <BackupOptionBtn
          icon="💾"
          title="Save to Device"
          subtitle="Download .cipherchat file to your computer"
          onClick={() => doBackup('local')}
          disabled={loading}
        />
        <BackupOptionBtn
          icon="☁️"
          title="Google Drive"
          subtitle="Upload encrypted backup to your Drive"
          onClick={() => doBackup('google_drive')}
          disabled={loading}
          badge={googleAuth ? '✓ Connected' : null}
        />
      </div>

      <div style={styles.setupNote}>
        <strong style={{ color: '#f59e0b' }}>⚠️ Google Drive Setup Required</strong>
        <div style={{ marginTop: 6, color: '#64748b', fontSize: 11, lineHeight: 1.7 }}>
          To use Google Drive, add to <code style={styles.code}>client/.env</code>:
          <pre style={styles.pre}>REACT_APP_GOOGLE_CLIENT_ID=your_client_id_here</pre>
          Get it from{' '}
          <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer"
            style={{ color: '#00e5ff' }}>
            console.cloud.google.com
          </a>{' '}
          → Enable Drive API → OAuth 2.0 Credentials
        </div>
      </div>
    </div>
  );
};

// ─── Restore Tab ──────────────────────────────────────────────────────────────
const RestoreTab = ({ user, onSuccess }) => {
  const [restoreMethod, setRestoreMethod] = useState('file'); // file | drive
  const [password, setPassword] = useState('');
  const [fileContent, setFileContent] = useState(null);
  const [fileName, setFileName] = useState('');
  const [driveFiles, setDriveFiles] = useState([]);
  const [selectedDriveFile, setSelectedDriveFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileInputRef = useRef();

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.cipherchat') && !file.name.endsWith('.json')) {
      setError('Please select a .cipherchat backup file');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setFileContent(ev.target.result);
    reader.readAsText(file);
    setError('');
  };

  const loadDriveFiles = async () => {
    setLoading(true);
    try {
      if (!isAuthenticated()) {
        setStatus('Connecting to Google…');
        await authenticateGoogle();
      }
      const files = await listDriveBackups();
      setDriveFiles(files);
      setStatus('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const doRestore = async () => {
    setError('');
    setResult(null);

    if (!password) return setError('Enter your backup password');

    let content = fileContent;

    if (restoreMethod === 'drive') {
      if (!selectedDriveFile) return setError('Select a backup file from Drive');
      setLoading(true);
      setStatus('Downloading from Google Drive…');
      try {
        content = await downloadFromDrive(selectedDriveFile.id);
      } catch (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
    }

    if (!content) return setError('No backup file selected');

    setLoading(true);
    try {
      // Decrypt the backup
      setStatus('Decrypting backup…');
      const backupData = await decryptBackup(content, password);

      // Verify it belongs to this user
      if (backupData.owner.username !== user.username) {
        throw new Error(
          `This backup belongs to @${backupData.owner.username}, not @${user.username}`
        );
      }

      // Send to server for restoration
      setStatus('Restoring messages…');
      const { data } = await api.post('/backup/restore', { backupData });

      setResult(data);
      setStatus('');
      setPassword('');
      setFileContent(null);
      setFileName('');
      onSuccess();
    } catch (err) {
      setError(err.message || 'Restore failed');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.tabContent}>
      <InfoBox
        icon="⬇️"
        text="Select your backup file and enter the backup password you used when creating the backup."
      />

      {/* Method selector */}
      <div style={styles.methodGroup}>
        {['file', 'drive'].map((m) => (
          <button
            key={m}
            style={{ ...styles.methodBtn, ...(restoreMethod === m ? styles.methodActive : {}) }}
            onClick={() => { setRestoreMethod(m); setError(''); setResult(null); }}
          >
            {m === 'file' ? '💾 From File' : '☁️ From Drive'}
          </button>
        ))}
      </div>

      {/* File restore */}
      {restoreMethod === 'file' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".cipherchat,.json"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            style={styles.filePickerBtn}
            onClick={() => fileInputRef.current.click()}
          >
            {fileName ? `📄 ${fileName}` : '📂 Choose .cipherchat file'}
          </button>
        </div>
      )}

      {/* Drive restore */}
      {restoreMethod === 'drive' && (
        <div>
          {driveFiles.length === 0 ? (
            <button style={styles.filePickerBtn} onClick={loadDriveFiles} disabled={loading}>
              {loading ? 'Connecting…' : '☁️ Load Drive Backups'}
            </button>
          ) : (
            <div style={styles.driveList}>
              {driveFiles.map((f) => (
                <div
                  key={f.id}
                  style={{
                    ...styles.driveItem,
                    ...(selectedDriveFile?.id === f.id ? styles.driveItemActive : {}),
                  }}
                  onClick={() => setSelectedDriveFile(f)}
                >
                  <span>☁️</span>
                  <div>
                    <div style={{ fontSize: 12, color: '#e2e8f0' }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {formatBytes(parseInt(f.size))} ·{' '}
                      {new Date(f.modifiedTime).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Field label="Backup Password" type="password" value={password}
        onChange={(e) => setPassword(e.target.value)} placeholder="Password used during backup" />

      {status && <StatusMsg text={status} />}
      {error && <ErrorMsg text={error} />}

      {/* Success result */}
      {result && (
        <div style={styles.successBox}>
          <div style={styles.successTitle}>✅ Restore Successful!</div>
          <div style={styles.successStats}>
            <span>💬 {result.restoredMessages} messages restored</span>
            <span>👤 {result.restoredContacts} contacts restored</span>
          </div>
        </div>
      )}

      <button style={styles.restoreBtn} onClick={doRestore} disabled={loading}>
        {loading ? 'Restoring…' : 'Restore Backup →'}
      </button>
    </div>
  );
};

// ─── Small reusable components ────────────────────────────────────────────────

const Field = ({ label, type, value, onChange, placeholder }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={styles.fieldLabel}>{label}</div>
    <input style={styles.input} type={type} value={value} onChange={onChange} placeholder={placeholder} />
  </div>
);

const InfoBox = ({ icon, text }) => (
  <div style={styles.infoBox}>{icon} {text}</div>
);

const StatusMsg = ({ text }) => (
  <div style={styles.statusMsg}>{text}</div>
);

const ErrorMsg = ({ text }) => (
  <div style={styles.errorMsg}>⚠️ {text}</div>
);

const BackupOptionBtn = ({ icon, title, subtitle, onClick, disabled, badge }) => (
  <button style={styles.optionBtn} onClick={onClick} disabled={disabled}>
    <div style={styles.optionIcon}>{icon}</div>
    <div style={styles.optionText}>
      <div style={styles.optionTitle}>{title}</div>
      <div style={styles.optionSub}>{subtitle}</div>
    </div>
    {badge && <div style={styles.optionBadge}>{badge}</div>}
  </button>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: '#111118', border: '1px solid #252535', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace" },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '24px 24px 0' },
  title: { fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: 0 },
  subtitle: { fontSize: 11, color: '#64748b', marginTop: 4 },
  closeBtn: { background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', padding: 4 },
  tabs: { display: 'flex', margin: '20px 24px 0', border: '1px solid #252535', borderRadius: 10, overflow: 'hidden', background: '#0a0a0f' },
  tab: { flex: 1, padding: '10px', background: 'none', border: 'none', color: '#64748b', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 },
  tabActive: { background: '#252535', color: '#00e5ff' },
  tabContent: { padding: '20px 24px' },
  infoBox: { background: '#16161f', border: '1px solid #252535', borderRadius: 8, padding: '12px 14px', fontSize: 11, color: '#94a3b8', lineHeight: 1.7, marginBottom: 18 },
  fieldLabel: { fontSize: 10, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  input: { width: '100%', padding: '11px 14px', background: '#16161f', border: '1px solid #252535', borderRadius: 8, color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  statusMsg: { fontSize: 11, color: '#10b981', textAlign: 'center', marginBottom: 10, padding: '8px', background: 'rgba(16,185,129,0.08)', borderRadius: 6 },
  errorMsg: { fontSize: 11, color: '#ef4444', textAlign: 'center', marginBottom: 10, padding: '8px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 },
  btnGroup: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 },
  optionBtn: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#16161f', border: '1px solid #252535', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.2s', width: '100%' },
  optionIcon: { fontSize: 24, flexShrink: 0 },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 13, color: '#e2e8f0', fontWeight: 600, marginBottom: 2 },
  optionSub: { fontSize: 10, color: '#64748b' },
  optionBadge: { fontSize: 9, color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', borderRadius: 10, flexShrink: 0 },
  setupNote: { background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '12px 14px', marginTop: 16, fontSize: 12, color: '#f59e0b' },
  code: { background: '#252535', padding: '1px 6px', borderRadius: 4, fontSize: 10 },
  pre: { background: '#252535', padding: '8px 10px', borderRadius: 6, fontSize: 10, color: '#10b981', marginTop: 8, overflowX: 'auto' },
  methodGroup: { display: 'flex', gap: 8, marginBottom: 14 },
  methodBtn: { flex: 1, padding: '9px', background: '#16161f', border: '1px solid #252535', borderRadius: 8, color: '#64748b', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5 },
  methodActive: { borderColor: '#00e5ff', color: '#00e5ff', background: 'rgba(0,229,255,0.06)' },
  filePickerBtn: { width: '100%', padding: '12px', background: '#16161f', border: '2px dashed #252535', borderRadius: 8, color: '#64748b', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, cursor: 'pointer', marginBottom: 14, textAlign: 'center' },
  driveList: { background: '#16161f', border: '1px solid #252535', borderRadius: 8, overflow: 'hidden', marginBottom: 14 },
  driveItem: { display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #1e1e2e', cursor: 'pointer' },
  driveItemActive: { background: 'rgba(0,229,255,0.06)', borderLeft: '2px solid #00e5ff' },
  restoreBtn: { width: '100%', padding: 13, background: 'linear-gradient(135deg, #7c3aed, #00e5ff)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 },
  successBox: { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, padding: '14px', marginBottom: 14 },
  successTitle: { fontSize: 13, color: '#10b981', fontWeight: 600, marginBottom: 8 },
  successStats: { display: 'flex', gap: 16, fontSize: 11, color: '#94a3b8' },
  historySection: { padding: '0 24px 16px' },
  sectionLabel: { fontSize: 9, color: '#475569', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  historyItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#16161f', borderRadius: 8, marginBottom: 6 },
  historyIcon: { fontSize: 18 },
  historyInfo: { flex: 1 },
  historyType: { fontSize: 12, color: '#e2e8f0' },
  historyMeta: { fontSize: 10, color: '#64748b', marginTop: 2 },
  statusBadge: { fontSize: 9, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusOk: { background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' },
  statusFail: { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' },
  secNote: { margin: '0 24px 20px', padding: '10px 14px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 8, fontSize: 10, color: '#94a3b8', lineHeight: 1.7 },
};

export default BackupModal;
