import { MessageCircle, Mic, Users } from 'lucide-react';
import { key, Motion } from './Kinetic';
import { OPENING_DURATION } from './program';

// A calm product introduction. The original film demonstrates the gameplay.
const enter = (start: number) => [key(start, { y: 15, o: 0 }), key(start + .7, { y: 0, o: 1 }, 'out')];
export function Opening() {
  return <section className="film-scene opening-scene" aria-label="A two-player co-op game for spoken English">
    <Motion className="opening-accent peach" keys={[key(0, { x: 0, y: 0, r: -8 }), key(OPENING_DURATION, { x: 12, y: -8, r: -4 }, 'linear')]}><MessageCircle size={83} strokeWidth={1.6} /></Motion>
    <Motion className="opening-accent sky" keys={[key(0, { x: 0, y: 0, r: 7 }), key(OPENING_DURATION, { x: -10, y: 8, r: 3 }, 'linear')]}><Mic size={73} strokeWidth={1.6} /></Motion>
    <div className="opening-copy">
      <Motion className="opening-category" keys={enter(.1)}><Users size={25} /><span>TWO PLAYERS. ONE TEAM.</span></Motion>
      <h1><Motion className="opening-definition" keys={enter(.4)}>A co-op game for</Motion><Motion className="opening-subject" keys={enter(.7)}>spoken English.</Motion></h1>
      <Motion className="opening-rule" keys={[key(1, { sx: 0, o: 0 }), key(1.7, { sx: 1, o: 1 }, 'out')]} />
      <Motion className="opening-premise" keys={enter(1.35)}><p>Team up. Talk in English.<br />Solve shared challenges.</p></Motion>
    </div>
  </section>;
}
