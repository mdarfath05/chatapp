import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../utils/api';
import { encryptMessage, decryptMessage } from '../utils/crypto';

const ChatWindow = ({ contact, currentUser, privateKey, socket, incomingMessage }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const contactRef = useRef(contact);

  // Keep contact ref in sync
  useEffect(() => {
    contactRef.current = contact;
  }, [contact]);

  // Decrypt all messages
  const decryptAll = useCallback(async (rawMsgs) => {
    const decrypted = await Promise.all(
      rawMsgs.map(async (msg) => {
        try {
          const isSender =
            msg.sender?._id === currentUser._id ||
            msg.sender === currentUser._id ||
            msg.sender?.username === currentUser.username;
          const pkg = isSender ? msg.encryptedForSender : msg.encryptedForRecipient;
          const plaintext = await decryptMessage(pkg, privateKey);
          return { ...msg, plaintext, decryptFailed: false };
        } catch {
          return { ...msg, plaintext: '[Unable to decrypt]', decryptFailed: true };
        }
      })
    );
    return decrypted;
  }, [currentUser, privateKey]);

  // Load conversation when contact changes
  useEffect(() => {
    if (!contact) return;
    setMessages([]);
    setIsTyping(false);
    setLoading(true);

    api.get(`/messages/${contact.username}`)
      .then(async ({ data }) => {
        const decrypted = await decryptAll(data);
        setMessages(decrypted);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [contact?.username]);

  // Handle incoming message from parent (ChatPage level)
  useEffect(() => {
    if (!incomingMessage || !contact) return;

    const senderUsername =
      incomingMessage.sender?.username || incomingMessage.sender;

    // Only handle if this message is from the currently open contact
    if (senderUsername !== contact.username) return;

    const handleIncoming = async () => {
      try {
        const pkg = incomingMessage.encryptedForRecipient;
        const plaintext = await decryptMessage(pkg, privateKey);
        setMessages((prev) => {
          // Avoid duplicates
          const exists = prev.find((m) => m._id === incomingMessage._id);
          if (exists) return prev;
          return [...prev, { ...incomingMessage, plaintext, decryptFailed: false }];
        });
        // Mark as read
        api.patch(`/messages/read/${contact.username}`).catch(() => {});
      } catch {
        setMessages((prev) => {
          const exists = prev.find((m) => m._id === incomingMessage._id);
          if (exists) return prev;
          return [...prev, { ...incomingMessage, plaintext: '[Unable to decrypt]', decryptFailed: true }];
        });
      }
    };

    handleIncoming();
  }, [incomingMessage]);

  // Typing indicator
  useEffect(() => {
    if (!socket || !contact) return;

    const handleTyping = ({ userId, username, isTyping: typing }) => {
      if (username === contact.username || userId === contact._id) {
        setIsTyping(typing);
      }
    };

    socket.on('user_typing', handleTyping);
    return () => socket.off('user_typing', handleTyping);
  }, [socket, contact]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending || !contact) return;

    setSending(true);
    try {
      const [encryptedForRecipient, encryptedForSender] = await Promise.all([
        encryptMessage(text, contact.publicKey),
        encryptMessage(text, currentUser.publicKey),
      ]);

      const { data } = await api.post('/messages', {
        recipientUsername: contact.username,
        encryptedForRecipient,
        encryptedForSender,
      });

      setMessages((prev) => [...prev, { ...data, plaintext: text, decryptFailed: false }]);
      setInput('');

      socket?.emit('typing', { recipientId: contact._id, isTyping: false });
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    socket?.emit('typing', { recipientId: contact._id, isTyping: true });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      socket?.emit('typing', { recipientId: contact._id, isTyping: false });
    }, 1500);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!contact) {
    return (
      <div style={styles.noChat}>
        <div style={{ fontSize: 64, opacity: 0.08 }}>💬</div>
        <div style={{ fontSize: 14, opacity: 0.4, marginTop: 12 }}>
          Select a contact to start chatting
        </div>
        <div style={{ fontSize: 10, color: '#334155', marginTop: 8 }}>
          All messages are end-to-end encrypted
        </div>
      </div>
    );
  }

  return (
    <div style={styles.window}>
      {/* Chat header */}
      <div style={styles.header}>
        <div style={styles.avatarWrap}>
          <div style={styles.avatar}>{contact.username[0].toUpperCase()}</div>
          {contact.isOnline && <div style={styles.onlineDot} />}
        </div>
        <div>
          <div style={styles.contactName}>{contact.username}</div>
          <div style={styles.contactSub}>
            {isTyping
              ? <span style={{ color: '#00e5ff' }}>✎ typing…</span>
              : contact.isOnline
              ? <span style={{ color: '#10b981' }}>● online</span>
              : <span style={{ color: '#475569' }}>● offline</span>}
          </div>
        </div>
        <div style={styles.encTag}>🔐 End-to-End Encrypted</div>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {loading && (
          <div style={styles.centerText}>Loading messages…</div>
        )}

        {!loading && messages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
            <div>No messages yet</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
              Say hello to {contact.username}!
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isSelf =
            msg.sender?._id === currentUser._id ||
            msg.sender === currentUser._id ||
            msg.sender?.username === currentUser.username;

          return (
            <div
              key={msg._id || i}
              style={{ ...styles.msgGroup, ...(isSelf ? styles.msgSelf : styles.msgOther) }}
            >
              <div style={styles.msgSender}>
                {isSelf ? 'You' : msg.sender?.username || contact.username}
              </div>
              <div
                style={{
                  ...styles.bubble,
                  ...(isSelf ? styles.bubbleSelf : styles.bubbleOther),
                  ...(msg.decryptFailed ? { opacity: 0.4, fontStyle: 'italic' } : {}),
                }}
              >
                {msg.plaintext}
              </div>
              <div style={styles.msgMeta}>
                <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ color: '#10b981', marginLeft: 6, fontSize: 9 }}>🔒</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputArea}>
        <textarea
          style={styles.textarea}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type an encrypted message… (Enter to send, Shift+Enter for new line)"
          rows={1}
          disabled={sending}
        />
        <button
          style={{ ...styles.sendBtn, ...((!input.trim() || sending) ? styles.sendBtnDisabled : {}) }}
          onClick={sendMessage}
          disabled={sending || !input.trim()}
        >
          {sending ? '…' : '↑'}
        </button>
      </div>
    </div>
  );
};

const styles = {
  window: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a0a0f' },
  noChat: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontFamily: "'JetBrains Mono', monospace" },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid #1e1e2e', background: '#111118', flexShrink: 0 },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: { width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #00e5ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: "'Syne', sans-serif" },
  onlineDot: { position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: '#10b981', border: '2px solid #111118' },
  contactName: { fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: '#e2e8f0' },
  contactSub: { fontSize: 10, color: '#64748b', marginTop: 2 },
  encTag: { marginLeft: 'auto', fontSize: 10, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 },
  messages: { flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  centerText: { textAlign: 'center', color: '#475569', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: 20 },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' },
  msgGroup: { display: 'flex', flexDirection: 'column', maxWidth: '68%', gap: 3 },
  msgSelf: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  msgSender: { fontSize: 10, color: '#64748b', letterSpacing: 0.5, paddingLeft: 4, paddingRight: 4 },
  bubble: { padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word', border: '1px solid #252535', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap' },
  bubbleSelf: { background: '#0f1a2e', borderColor: 'rgba(0,229,255,0.15)', borderBottomRightRadius: 3 },
  bubbleOther: { background: '#0f1a1a', borderColor: 'rgba(124,58,237,0.15)', borderBottomLeftRadius: 3 },
  msgMeta: { display: 'flex', alignItems: 'center', fontSize: 9, color: '#334155', paddingLeft: 4, paddingRight: 4 },
  inputArea: { display: 'flex', gap: 10, padding: '16px 20px', borderTop: '1px solid #1e1e2e', background: '#111118', alignItems: 'flex-end', flexShrink: 0 },
  textarea: { flex: 1, padding: '12px 16px', background: '#16161f', border: '1px solid #252535', borderRadius: 10, color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: 'none', resize: 'none', minHeight: 44, maxHeight: 120, lineHeight: 1.5, boxSizing: 'border-box' },
  sendBtn: { width: 44, height: 44, background: 'linear-gradient(135deg, #7c3aed, #00e5ff)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'opacity 0.2s' },
  sendBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
};

export default ChatWindow;
