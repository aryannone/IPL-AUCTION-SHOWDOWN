import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/useAuth.jsx';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';

import Lobby from './Lobby.jsx';
import Strategy from './Strategy.jsx';
import Auction from './Auction.jsx';
import Results from './Results.jsx';

export default function GameRoom() {
  const { roomCode } = useParams();
  const { token, user, loading } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState(null);
  const [mySlot, setMySlot] = useState(null);
  const [connStatus, setConnStatus] = useState('CONNECTING'); // CONNECTED | RECONNECTING | DISCONNECTED
  const [error, setError] = useState('');
  const [lastEvent, setLastEvent] = useState(null); // most recent event payload for transient UI (SOLD banners etc.)
  const socketRef = useRef(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/'); return; }

    const socket = getSocket(token);
    socketRef.current = socket;

    function joinRoom() {
      socket.emit('JOIN_GAME_ROOM', { roomCode }, (res) => {
        if (!res.ok) {
          setError(res.error === 'ROOM_NOT_FOUND' ? 'Room not found.' : res.error === 'FORBIDDEN' ? 'You are not part of this game.' : 'Could not join room.');
          return;
        }
        setState(res.state);
        setMySlot(res.yourSlot);
        setConnStatus('CONNECTED');
      });
    }

    socket.on('connect', () => { setConnStatus('CONNECTED'); joinRoom(); });
    socket.on('disconnect', () => setConnStatus('RECONNECTING'));
    socket.io.on('reconnect_attempt', () => setConnStatus('RECONNECTING'));

    socket.on('GAME_STATE_SYNC', (s) => setState(s));
    socket.on('GAME_STARTED', (s) => { setState(s); setLastEvent({ type: 'GAME_STARTED' }); });
    socket.on('AUCTION_STARTED', (s) => setState(s));
    socket.on('PLAYER_DRAWN', (payload) => {
      setState((prev) => prev ? { ...prev, currentRound: payload.round, currentPlayerId: payload.player.playerId, currentBidLakh: payload.currentBidLakh, currentBidderUserId: null, auctionEndsAt: payload.auctionEndsAt } : prev);
      setLastEvent({ type: 'PLAYER_DRAWN', payload });
    });
    socket.on('BID_UPDATED', (payload) => {
      setState((prev) => prev ? { ...prev, currentBidLakh: payload.currentBidLakh, currentBidderUserId: payload.currentBidderUserId, auctionEndsAt: payload.auctionEndsAt } : prev);
    });
    socket.on('PLAYER_SOLD', (payload) => {
      setState((prev) => prev ? { ...prev, participants: payload.participants } : prev);
      setLastEvent({ type: 'PLAYER_SOLD', payload });
    });
    socket.on('PLAYER_UNSOLD', (payload) => setLastEvent({ type: 'PLAYER_UNSOLD', payload }));
    socket.on('GAME_FINISHED', (payload) => {
      setState((prev) => prev ? { ...prev, status: 'FINISHED', results: payload.results, winnerUserId: payload.winnerUserId } : prev);
    });
    socket.on('GAME_ABANDONED', () => {
      setState((prev) => prev ? { ...prev, status: 'ABANDONED' } : prev);
    });
    socket.on('PLAYER_CONNECTED', ({ userId }) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = { ...prev, participants: { ...prev.participants } };
        for (const slot of [1, 2]) {
          if (next.participants[slot]?.userId === userId) {
            next.participants[slot] = { ...next.participants[slot], connected: true };
          }
        }
        return next;
      });
    });
    socket.on('PLAYER_DISCONNECTED', ({ userId }) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = { ...prev, participants: { ...prev.participants } };
        for (const slot of [1, 2]) {
          if (next.participants[slot]?.userId === userId) {
            next.participants[slot] = { ...next.participants[slot], connected: false };
          }
        }
        return next;
      });
    });

    if (socket.connected) joinRoom();

    // fallback REST fetch in case sockets are slow to connect (also covers hard refresh)
    api.getGame(token, roomCode).then((res) => {
      setState((prev) => prev || res.state);
      setMySlot((prev) => prev || res.yourSlot);
    }).catch(() => {});

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('GAME_STATE_SYNC');
      socket.off('GAME_STARTED');
      socket.off('AUCTION_STARTED');
      socket.off('PLAYER_DRAWN');
      socket.off('BID_UPDATED');
      socket.off('PLAYER_SOLD');
      socket.off('PLAYER_UNSOLD');
      socket.off('GAME_FINISHED');
      socket.off('GAME_ABANDONED');
      socket.off('PLAYER_CONNECTED');
      socket.off('PLAYER_DISCONNECTED');
    };
  }, [token, user, loading, roomCode, navigate]);

  const placeBid = useCallback((bidLakh) => {
    return new Promise((resolve) => {
      socketRef.current?.emit('PLACE_BID', { bidLakh }, (res) => resolve(res));
    });
  }, []);

  const setReady = useCallback(() => {
    return new Promise((resolve) => {
      socketRef.current?.emit('PLAYER_READY', {}, (res) => resolve(res));
    });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-2xl font-display text-red-400 mb-2">ERROR</div>
        <div className="text-white/60">{error}</div>
        <button onClick={() => navigate('/')} className="mt-6 px-6 py-2 rounded-lg bg-gold text-ink-900 font-semibold">Back Home</button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/50">
        Connecting to room {roomCode}…
      </div>
    );
  }

  const commonProps = { state, mySlot, myUserId: user?.id, roomCode, connStatus };

  return (
    <div className="min-h-screen pb-10">
      <ConnBanner status={connStatus} />
      {state.status === 'LOBBY' && <Lobby {...commonProps} onReady={setReady} />}
      {state.status === 'STRATEGY' && <Strategy {...commonProps} />}
      {state.status === 'AUCTION' && <Auction {...commonProps} onBid={placeBid} lastEvent={lastEvent} />}
      {state.status === 'FINISHED' && <Results {...commonProps} />}
      {state.status === 'ABANDONED' && (
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
          <div className="text-3xl font-display text-red-400 mb-3">GAME ABANDONED</div>
          <p className="text-white/50 mb-6">Your opponent left the match permanently.</p>
          <button onClick={() => navigate('/')} className="px-6 py-2 rounded-lg bg-gold text-ink-900 font-semibold">Back Home</button>
        </div>
      )}
    </div>
  );
}

function ConnBanner({ status }) {
  if (status === 'CONNECTED') return null;
  return (
    <div className="w-full text-center text-xs py-1.5 bg-yellow-500/20 text-yellow-300 sticky top-0 z-50">
      🟡 {status === 'RECONNECTING' ? 'RECONNECTING…' : 'CONNECTING…'}
    </div>
  );
}
