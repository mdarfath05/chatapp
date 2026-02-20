import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import KeysModal from '../components/KeysModal';
import BackupModal from '../components/BackupModal';

const ChatPage = () => {
  const { user, privateKey, socket, logout } = useAuth();
  const [activeContact, setActiveContact] = useState(null);
  const [showKeys, setShowKeys] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [incomingMessage, setIncomingMessage] = useState(null);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg) => {
      console.log('📨 new_message received in ChatPage:', msg.sender?.username);
      // Always set — both Sidebar and ChatWindow will react to this
      setIncomingMessage({ ...msg, receivedAt: Date.now() });
    };

    socket.on('new_message', handleNewMessage);

    // Debug: confirm socket is listening
    console.log('ChatPage: socket listening for new_message, socket id:', socket.id);

    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket]);

  return (
    <div style={styles.page}>
      {/* Topbar */}
      <div style={styles.topbar}>
        <div style={styles.topbarLeft}>
          <span style={styles.brand}>CipherChat</span>
          <span style={styles.sep}>/</span>
          <span style={styles.username}>@{user?.username}</span>
        </div>
        <div style={styles.topbarRight}>
          <div style={styles.encBadge}>🔒 E2E Encrypted</div>
          <button style={styles.navBtn} onClick={() => setShowBackup(true)}>Backup</button>
          <button style={styles.navBtn} onClick={() => setShowKeys(true)}>Keys</button>
          <button style={{ ...styles.navBtn, color: '#ef4444' }} onClick={logout}>Logout</button>
        </div>
      </div>

      {/* Body */}
      <div style={styles.body}>
        <Sidebar
          currentUser={user}
          activeContact={activeContact}
          onSelectContact={setActiveContact}
          socket={socket}
          incomingMessage={incomingMessage}
        />
        <ChatWindow
          contact={activeContact}
          currentUser={user}
          privateKey={privateKey}
          socket={socket}
          incomingMessage={incomingMessage}
        />
      </div>

      {showKeys && <KeysModal user={user} onClose={() => setShowKeys(false)} />}
      {showBackup && <BackupModal user={user} onClose={() => setShowBackup(false)} />}
    </div>
  );
};

const styles = {
  page: { height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0f', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden' },
  topbar: { display: 'flex', alignItems: 'center', padding: '0 20px', height: 56, borderBottom: '1px solid #1e1e2e', background: '#111118', flexShrink: 0 },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  brand: { fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: '#00e5ff' },
  sep: { color: '#334155' },
  username: { fontSize: 12, color: '#64748b' },
  topbarRight: { marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' },
  encBadge: { fontSize: 10, color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '4px 10px', borderRadius: 20 },
  navBtn: { padding: '5px 12px', background: '#16161f', border: '1px solid #252535', borderRadius: 6, color: '#64748b', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: 'pointer' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
};

export default ChatPage;
