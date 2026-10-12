import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { btn, Logo } from '@/components/ui';
import { getName, setName } from '@/lib/profile';

/** Landing page of the QR code: one tap to join with a fun default name. */
export default function JoinPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [name, setNameState] = useState(getName);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-4 dot-grid">
      <form
        className="clay-card w-full max-w-sm p-7 text-center"
        onSubmit={(e) => {
          e.preventDefault();
          setName(name);
          navigate(`/room/${code.toUpperCase()}`);
        }}
      >
        <Logo size={48} />
        <h1 className="mt-5 text-2xl font-bold">You’re invited!</h1>
        <p className="text-muted">Room</p>
        <div className="font-display text-5xl font-bold tracking-[0.3em]">{code.toUpperCase()}</div>
        <label className="mt-5 mb-1 block text-left text-sm font-bold" htmlFor="join-name">
          Your name
        </label>
        <input id="join-name" className="input-clay text-center font-display text-xl" value={name} maxLength={24} onChange={(e) => setNameState(e.target.value)} />
        <button className={btn('primary', 'lg', 'mt-5 w-full')}>Join the game →</button>
        <p className="mt-4 text-xs font-semibold text-muted">Tip: allow the microphone to talk, or just type.</p>
      </form>
    </div>
  );
}
