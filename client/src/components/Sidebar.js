import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';

const Sidebar = ({ currentUser, activeContact, onSelectContact, socket, incomingMessage }) => {
  // conversations = WhatsApp-style list: everyone who has ever messaged you or you messaged
  const [conversations, setConversations] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const activeContactRef = useRef(activeContact);

  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  // Load conversations on mount (like WhatsApp chat list)
  useEffect(() => {
    fetchConversations();
  }, []);

  // Poll every 5 seconds to catch any missed messages
  useEffect(() => {
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle real-time incoming message
  useEffect(() => {
    if (!incomingMessage) return;

    const senderUsername = incomingMessage.sender?.username;
    const senderPublicKey = incomingMessage.sender?.publicKey || '';
    const senderId = incomingMessage.sender?._id;

    if (!senderUsername) return;

    const isCurrentlyOpen = activeContactRef.current?.username === senderUsername;

    setConversations((prev) => {
      // Check if this sender already has a conversation row
      const existingIndex = prev.findIndex((c) => c.username === senderUsername);

      const updatedConv = {
        _id: senderId || senderUsername,
        username: senderUsername,
        publicKey: senderPublicKey,
        isOnline: true,
        lastMessageAt: new Date().toISOString(),
        preview: '🔒 New encrypted message',
        unreadCount: isCurrentlyOpen
          ? 0
          : existingIndex >= 0
          ? (prev[existingIndex].unreadCount || 0) + 1
          : 1,
      };

      if (existingIndex >= 0) {
        // Update existing — move to top
        const updated = [...prev];
        updated.splice(existingIndex, 1);
        return [updatedConv, ...updated];
      } else {
        // New conversation — add to top
        return [updatedConv, ...prev];
      }
    });
  }, [incomingMessage]);

  // Clear unread when a contact is opened
  useEffect(() => {
    if (!activeContact?.username) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.username === activeContact.username ? { ...c, unreadCount: 0 } : c
      )
    );
  }, [activeContact]);

  // Online/offline via socket
  useEffect(() => {
    if (!socket) return;
    const handleOnline = ({ username }) => {
      setConversations((prev) =>
        prev.map((c) => (c.username === username ? { ...c, isOnline: true } : c))
      );
    };
    const handleOffline = ({ username }) => {
      setConversations((prev) =>
        prev.map((c) => (c.username === username ? { ...c, isOnline: false } : c))
      );
    };
    socket.on('user_online', handleOnline);
    socket.on('user_offline', handleOffline);
    return () => {
      socket.off('user_online', handleOnline);
      socket.off('user_offline', handleOffline);
    };
  }, [socket]);

  const fetchConversations = async () => {
    try {
      // Get all conversations from server (message history based)
      const { data } = await api.get('/messages');
      const mapped = data.map((conv) => ({
        _id: conv.contact?._id,
        username: conv.contact?.username,
        publicKey: conv.contact?.publicKey,
        isOnline: conv.contact?.isOnline ?? false,
        lastMessageAt: conv.lastMessage?.createdAt,
        preview: '🔒 Encrypted message',
        unreadCount: conv.unreadCount || 0,
      }));

      // Merge with existing — preserve real-time unread counts
      setConversations((prev) => {
        const merged = [...mapped];
        // Keep any real-time conversations not yet in server response
        prev.forEach((p) => {
          if (!merged.find((m) => m.username === p.username)) {
            merged.unshift(p);
          }
        });
        return merged;
      });
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  };

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQ(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await api.get(`/users/search?q=${q}`);
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const startChat = (user) => {
    // Start new chat with a searched user
    const contact = {
      _id: user._id,
      username: user.username,
      publicKey: user.publicKey,
      isOnline: user.isOnline,
    };
    setSearchQ('');
    setSearchResults([]);

    // Add to conversations list if not already there
    setConversations((prev) => {
      if (prev.find((c) => c.username === user.username)) return prev;
      return [{ ...contact, unreadCount: 0, preview: '' }, ...prev];
    });

    onSelectContact(contact);
  };

  const handleSelectContact = (conv) => {
    setConversations((prev) =>
      prev.map((c) => (c.username === conv.username ? { ...c, unreadCount: 0 } : c))
    );
    onSelectContact(conv);
  };

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const formatTime = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
  };

  return (
    <div style={styles.sidebar}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerRow}>
          <div style={styles.headerTitle}>CipherChat</div>
          {totalUnread > 0 && (
            <div style={styles.totalBadge}>{totalUnread}</div>
          )}
        </div>
        <div style={styles.userBadge}>
          <div style={styles.onlineDotSmall} />
          {currentUser.username}
        </div>
      </div>

      {/* Search bar — search users to start new chat */}
      <div style={styles.searchWrap}>
        <div style={styles.searchIconWrap}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            style={styles.searchInput}
            value={searchQ}
            onChange={handleSearch}
            placeholder="Search users…"
          />
          {searchQ && (
            <button style={styles.clearBtn} onClick={() => { setSearchQ(''); setSearchResults([]); }}>✕</button>
          )}
        </div>

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div style={styles.dropdown}>
            {searching && <div style={styles.dropNote}>Searching…</div>}
            {searchResults.map((u) => (
              <div key={u._id} style={styles.dropItem} onClick={() => startChat(u)}>
                <div style={styles.dropAvatar}>{u.username[0].toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 13, color: '#e2e8f0' }}>@{u.username}</div>
                  <div style={{ fontSize: 10, color: '#475569' }}>
                    {u.isOnline ? '● online' : '● offline'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conversations list — like WhatsApp */}
      <div style={styles.sectionLabel}>
        {conversations.length > 0 ? 'Chats' : 'No chats yet'}
      </div>

      <div style={styles.list}>
        {conversations.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
            Search for a user above<br />to start a new chat
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = activeContact?.username === conv.username;
            const hasUnread = (conv.unreadCount || 0) > 0;

            return (
              <div
                key={conv._id || conv.username}
                style={{
                  ...styles.convItem,
                  ...(isActive ? styles.convActive : {}),
                  ...(hasUnread ? styles.convUnread : {}),
                }}
                onClick={() => handleSelectContact(conv)}
              >
                {/* Avatar */}
                <div style={styles.avatarWrap}>
                  <div style={styles.avatar}>
                    {conv.username?.[0]?.toUpperCase()}
                  </div>
                  {conv.isOnline && <div style={styles.onlineDot} />}
                </div>

                {/* Info */}
                <div style={styles.convInfo}>
                  <div style={styles.convTop}>
                    <div style={styles.convName}>{conv.username}</div>
                    <div style={styles.convTime}>{formatTime(conv.lastMessageAt)}</div>
                  </div>
                  <div style={styles.convBottom}>
                    <div style={{
                      ...styles.convPreview,
                      color: hasUnread ? '#94a3b8' : '#475569',
                      fontWeight: hasUnread ? 500 : 400,
                    }}>
                      {conv.preview || '🔒 Encrypted message'}
                    </div>
                    {hasUnread && (
                      <div style={styles.unreadBadge}>{conv.unreadCount}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.encBadge}>🔐 E2E Encrypted</div>
      </div>
    </div>
  );
};

const styles = {
  sidebar: { width: 300, borderRight: '1px solid #1e1e2e', background: '#111118', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  header: { padding: '16px 16px 12px', borderBottom: '1px solid #1e1e2e' },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  headerTitle: { fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: '#00e5ff' },
  totalBadge: { background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, minWidth: 22, textAlign: 'center' },
  userBadge: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' },
  onlineDotSmall: { width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' },
  searchWrap: { padding: '10px 12px', borderBottom: '1px solid #1e1e2e', position: 'relative' },
  searchIconWrap: { display: 'flex', alignItems: 'center', background: '#16161f', border: '1px solid #252535', borderRadius: 20, padding: '0 12px', gap: 8 },
  searchIcon: { fontSize: 12, opacity: 0.5 },
  searchInput: { flex: 1, padding: '9px 0', background: 'none', border: 'none', color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, outline: 'none' },
  clearBtn: { background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12, padding: 0 },
  dropdown: { position: 'absolute', top: '100%', left: 12, right: 12, background: '#16161f', border: '1px solid #252535', borderRadius: 10, zIndex: 50, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' },
  dropNote: { padding: '8px 12px', fontSize: 11, color: '#475569' },
  dropItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #1e1e2e', transition: 'background 0.1s' },
  dropAvatar: { width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #7c3aed, #00e5ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 },
  sectionLabel: { padding: '8px 16px 4px', fontSize: 9, color: '#475569', letterSpacing: 2, textTransform: 'uppercase' },
  list: { flex: 1, overflowY: 'auto' },
  empty: { textAlign: 'center', padding: '40px 20px', color: '#475569', fontSize: 12, lineHeight: 2 },
  convItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', border: 'none', borderBottom: '1px solid #0a0a0f', transition: 'background 0.1s' },
  convActive: { background: '#16161f', borderLeft: '3px solid #00e5ff' },
  convUnread: { background: 'rgba(0,229,255,0.03)' },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: { width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #7c3aed, #00e5ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: '#fff', fontFamily: "'Syne', sans-serif" },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: '#10b981', border: '2px solid #111118', boxShadow: '0 0 6px #10b981' },
  convInfo: { flex: 1, minWidth: 0 },
  convTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  convName: { fontSize: 14, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Syne', sans-serif" },
  convTime: { fontSize: 10, color: '#475569', flexShrink: 0, marginLeft: 8 },
  convBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  convPreview: { fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  unreadBadge: { background: '#00e5ff', color: '#0a0a0f', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, minWidth: 20, textAlign: 'center', flexShrink: 0, marginLeft: 8 },
  footer: { padding: 12, borderTop: '1px solid #1e1e2e' },
  encBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 10, color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '6px 10px', borderRadius: 20 },
};

export default Sidebar;
