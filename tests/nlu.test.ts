import { describe, expect, it } from 'vitest';
import { parseUtterance } from '../shared/nlu';

const guide = { speaker: 'guide' as const, listener: 'builder' as const };
const builder = { speaker: 'builder' as const, listener: 'guide' as const };

describe('rule-based NLU', () => {
  it('parses a pick instruction with size and landmark', () => {
    const p = parseUtterance('Pick up the small rocket next to the lamp', guide);
    expect(p.intent).toBe('pick');
    expect(p.target).toMatchObject({ kind: 'rocket', size: 'small', rel: { type: 'nextTo', refs: [{ kind: 'lamp' }] } });
    expect(p.unmarked).toEqual([]);
  });

  it('flags a bare "left" as unmarked', () => {
    const p = parseUtterance('grab the mug on the left', guide);
    expect(p.target).toMatchObject({ kind: 'mug', sup: { type: 'leftmost', view: 'unmarked' } });
    expect(p.unmarked.length).toBe(1);
  });

  it('maps "your left" to the listener and "my left" to the speaker', () => {
    expect(parseUtterance('the rocket on your left', guide).target?.sup).toEqual({ type: 'leftmost', view: 'builder' });
    expect(parseUtterance('the rocket on my left', guide).target?.sup).toEqual({ type: 'leftmost', view: 'guide' });
    expect(parseUtterance('the rocket on my left', guide).speakerFrame.length).toBe(1);
  });

  it('parses a place instruction and resolves "closer to you" as a frame', () => {
    const p = parseUtterance('Put the teddy bear behind the red book, closer to you', guide);
    expect(p.intent).toBe('place');
    expect(p.target).toMatchObject({ kind: 'teddy' });
    expect(p.place?.rel).toMatchObject({ type: 'inFrontOf', view: 'builder', refs: [{ kind: 'redBook' }] });
    expect(p.unmarked).toEqual([]);
  });

  it('parses "between X and Y"', () => {
    const p = parseUtterance('move it between the lamp and the plant', guide);
    expect(p.intent).toBe('place');
    expect(p.target?.deictic).toBe(true);
    expect(p.place?.rel).toMatchObject({ type: 'between', refs: [{ kind: 'lamp' }, { kind: 'plant' }] });
  });

  it('does not read "right next to" as a direction', () => {
    const p = parseUtterance('the blue cup right next to the plant', guide);
    expect(p.target).toMatchObject({ kind: 'mug', color: 'blue', rel: { type: 'nextTo' } });
    expect(p.unmarked).toEqual([]);
  });

  it('uses "(your left)" to pin down a relation', () => {
    const p = parseUtterance('put the cupcake to the left of the lamp, your left', guide);
    expect(p.place?.rel).toMatchObject({ type: 'leftOf', view: 'builder' });
    expect(p.unmarked).toEqual([]);
  });

  it('detects clarification questions', () => {
    expect(parseUtterance('Which one?', builder)).toMatchObject({ intent: 'question', question: 'which' });
    expect(parseUtterance('my left or your left?', builder)).toMatchObject({ intent: 'question', question: 'frame' });
    expect(parseUtterance('Is it this one?', builder)).toMatchObject({ intent: 'question', question: 'check' });
    expect(parseUtterance('Do you mean my "in front" or your "in front"?', builder)).toMatchObject({ intent: 'question', question: 'frame' });
    expect(parseUtterance('Behind from my side or yours?', builder)).toMatchObject({ intent: 'question', question: 'frame' });
  });

  it('detects confirmations and vague pointer words', () => {
    expect(parseUtterance('Yes, that one!', guide).intent).toBe('confirm');
    expect(parseUtterance('No, the other one', guide).intent).toBe('deny');
    expect(parseUtterance('put it over there', guide).vague).toContain('there');
  });

  it('understands synonyms such as cup, shoe and gamepad', () => {
    expect(parseUtterance('take the yellow cup', guide).target).toMatchObject({ kind: 'mug', color: 'yellow' });
    expect(parseUtterance('grab the big shoe', guide).target).toMatchObject({ kind: 'sneaker', size: 'big' });
    expect(parseUtterance('pick the gamepad', guide).target).toMatchObject({ kind: 'controller' });
    expect(parseUtterance('pick the cupcake', guide).target).toMatchObject({ kind: 'cupcake' });
  });
});
