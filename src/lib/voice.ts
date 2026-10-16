import { useEffect, useRef, useState } from 'react';
import type { ServerInfo } from '@shared/protocol';
import type { GameClient } from './game-client';

/**
 * Optional peer-to-peer voice for remote duos (WebRTC audio, Socket.IO as
 * the signalling channel). Players in the same room at a booth just talk
 * out loud; this is for playing across the internet.
 */

type Signal = { type: 'offer' | 'answer'; sdp: string } | { type: 'ice'; candidate: RTCIceCandidateInit } | { type: 'bye' };

export function useVoiceLink(client: GameClient, enabled: boolean, partnerId: string | null, ice: ServerInfo['iceServers']) {
  const [status, setStatus] = useState<'off' | 'connecting' | 'live' | 'error'>('off');
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!enabled || !partnerId) {
      setStatus('off');
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    const me = client.store.getState().state?.you ?? '';
    const pc = new RTCPeerConnection({ iceServers: ice });
    pcRef.current = pc;
    const send = (data: Signal) => client.socket.emit('rtc:signal', { to: partnerId, data });
    const audio = new Audio();
    audio.autoplay = true;
    audioRef.current = audio;

    pc.onicecandidate = (e) => e.candidate && send({ type: 'ice', candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0];
      void audio.play().catch(() => undefined);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('live');
      if (pc.connectionState === 'failed') {
        setStatus('error');
        setError('Voice link failed (network blocks peer-to-peer). Talk face to face or type.');
      }
    };

    const onSignal = async ({ from, data }: { from: string; data: unknown }) => {
      if (from !== partnerId || cancelled) return;
      const sig = data as Signal;
      try {
        if (sig.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: 'answer', sdp: answer.sdp ?? '' });
        } else if (sig.type === 'answer') await pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
        else if (sig.type === 'ice') await pc.addIceCandidate(sig.candidate);
      } catch (err) {
        console.warn('[voice] signal error', err);
      }
    };
    client.socket.on('rtc:signal', onSignal);

    (async () => {
      setStatus('connecting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (cancelled) return;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream!));
        // The lexicographically smaller id makes the offer, so exactly one side does.
        if (me < partnerId) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({ type: 'offer', sdp: offer.sdp ?? '' });
        }
      } catch (err) {
        setStatus('error');
        setError((err as Error).name === 'NotAllowedError' ? 'Microphone blocked by the browser.' : 'Could not start the microphone (HTTPS or localhost is required).');
      }
    })();

    return () => {
      cancelled = true;
      client.socket.off('rtc:signal', onSignal);
      stream?.getTracks().forEach((t) => t.stop());
      pc.close();
      audio.srcObject = null;
      pcRef.current = null;
    };
  }, [client, enabled, partnerId, ice]);

  return { status, error };
}
