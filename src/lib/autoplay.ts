import { describeCell, describeObject, realizePlace, realizeRef } from '@shared/reg';
import { parseUtterance } from '@shared/nlu';
import type { ClientMission, ClientRoomState } from '@shared/protocol';
import { freeCells, resolvePlace, resolveRef, sceneEntities } from '@shared/spatial';
import type { Cell, PlaceDesc, RefDesc } from '@shared/types';
import type { GameClient } from './game-client';
import { speak } from './speech';

/**
 * Scripted, hands-free demo for the split-screen page (booth backup + video).
 * Each mission plays out the core lesson: the guide first speaks from their
 * OWN side, the builder asks "my left or your left?", the guide fixes it,
 * and the builder acts on the clear sentence (resolved by the same NLU the
 * AI partner uses).
 */

function egocentric<T extends RefDesc | PlaceDesc>(desc: T): T {
  const copy = structuredClone(desc);
  if (copy.rel && copy.rel.view !== 'none') copy.rel.view = 'unmarked';
  if ('sup' in copy && copy.sup) copy.sup.view = 'unmarked';
  return copy;
}

/** A first attempt that is correct from the guide's side but misleading for the builder. */
function slip(st: ClientRoomState, m: ClientMission): string | null {
  const scene = st.scene;
  if (!scene) return null;
  const own = { speaker: 'builder' as const, listener: 'guide' as const };
  const g2b = { speaker: 'guide' as const, listener: 'builder' as const };
  if (m.type === 'find' && m.targetId) {
    const c = describeObject(scene, m.targetId, own, 8).find((x) => x.perspective);
    return c ? `Pick up ${realizeRef(egocentric(c.desc), g2b)}.` : null;
  }
  if (m.type === 'place' && m.itemId && m.targetCell) {
    const item = describeObject(scene, m.itemId, g2b)[0];
    const c = describeCell(scene, m.targetCell, m.itemId, own, 8).find((x) => x.perspective);
    return item && c ? `Put ${item.text} ${realizePlace(egocentric(c.desc), g2b)}.` : null;
  }
  return null;
}

export function startAutoplay(guide: GameClient, builder: GameClient, opts: { voice?: boolean } = {}) {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let lastMission = '';
  let stopped = false;
  const at = (ms: number, fn: () => void) => timers.push(setTimeout(() => !stopped && fn(), ms));
  const say = (c: GameClient, text: string, pitch: number) => {
    c.actions.say(text, 'voice');
    if (opts.voice) speak(text, { pitch, rate: 1.05 });
  };

  const act = (st: ClientRoomState, m: ClientMission, sentence: string, t0: number) => {
    const bState = builder.store.getState().state;
    const scene = bState?.scene ?? st.scene!;
    const entities = sceneEntities(scene);
    const p = parseUtterance(sentence, { speaker: 'guide', listener: 'builder' });
    const hits = p.target ? resolveRef(p.target, entities, 'builder').filter((e) => !e.landmark) : [];
    const objectId = hits.length === 1 ? hits[0].id : (m.targetId ?? m.itemId)!;
    at(t0, () => builder.actions.hover({ objectId, cell: null }));
    if (m.type === 'find') {
      at(t0 + 1100, () => builder.actions.pick(objectId));
      return;
    }
    let cell: Cell | undefined = m.targetCell;
    if (p.place) {
      const cells = resolvePlace(p.place, entities, freeCells(scene, objectId), 'builder', objectId);
      if (cells.length === 1) cell = cells[0];
    }
    at(t0 + 1000, () => builder.actions.pick(objectId));
    at(t0 + 1900, () => cell && builder.actions.hover({ objectId: null, cell }));
    at(t0 + 2900, () => cell && builder.actions.place(cell));
  };

  const onState = (st: ClientRoomState | null) => {
    if (!st || st.phase !== 'playing' || !st.mission?.modelAnswer || st.mission.id === lastMission) return;
    lastMission = st.mission.id;
    const m = st.mission;
    const first = slip(st, m);
    if (first) {
      const dir = /left|right/.test(first) ? (/left/.test(first) ? 'left' : 'right') : /front/.test(first) ? '“in front”' : '“behind”';
      at(900, () => say(guide, first, 1.15));
      at(3300, () => say(builder, `Wait, do you mean my ${dir} or your ${dir}?`, 0.9));
      at(5600, () => say(guide, `Oh, sorry! From your side: ${m.modelAnswer}`, 1.15));
      act(st, m, m.modelAnswer!, 7600);
    } else {
      at(900, () => say(guide, m.modelAnswer!, 1.15));
      at(3000, () => say(builder, 'Got it!', 0.9));
      act(st, m, m.modelAnswer!, 3600);
    }
  };

  const unsub = guide.store.subscribe((s) => onState(s.state));
  onState(guide.store.getState().state);
  return () => {
    stopped = true;
    unsub();
    timers.forEach(clearTimeout);
  };
}
