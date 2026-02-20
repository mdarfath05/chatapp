import React, { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import api from '../utils/api';
import { decryptPrivateKey } from '../utils/crypto';

const AuthContext = createContext(null);

const SERVER_URL = 'http://127.0.0.1:5001';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_user')); } catch { return null; }
  });
  const [privateKey, setPrivateKey] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('cc_token');
    if (!token || !user) return;

    console.log('Connecting socket to', SERVER_URL);
    const s = io(SERVER_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
    });

    s.on('connect', () => console.log('✓ Socket connected:', s.id));
    s.on('connect_error', (err) => console.error('✗ Socket error:', err.message));
    s.on('disconnect', (reason) => console.log('Socket disconnected:', reason));

    setSocket(s);
    return () => { s.disconnect(); };
  }, [user?._id]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { username, password });
      const privKey = await decryptPrivateKey(data.encryptedPrivateKey, password);
      localStorage.setItem('cc_token', data.token);
      localStorage.setItem('cc_user', JSON.stringify(data.user));
      setUser(data.user);
      setPrivateKey(privKey);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  const register = async (username, password, publicKey, encryptedPrivateKey) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { username, password, publicKey, encryptedPrivateKey });
      localStorage.setItem('cc_token', data.token);
      localStorage.setItem('cc_user', JSON.stringify(data.user));
      setUser(data.user);
      return { success: true };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || 'Registration failed' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    socket?.disconnect();
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_user');
    setUser(null);
    setPrivateKey(null);
    setSocket(null);
  };

  return (
    <AuthContext.Provider value={{ user, privateKey, socket, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
