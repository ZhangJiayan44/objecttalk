import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkInput, runAgent, setTransport, type LlmRequest, type LlmResponse, type LlmTransport, type Toolkit } from '../server/agent/harness';
import { PartnerBrain } from '../server/agent/partner';
import { createTabletopBot } from '../server/game/bots/tabletop';
import type { BotIO } from '../server/game/engines/types';
import { createRng } from '../shared/rng';
import type { AgentTrace } from '../shared/protocol';
import type { FindMission, SceneState } from '../shared/types';

/** A transport that replays a script of model turns and records every request. */
function scripted(turns: LlmResponse[]) {
  const requests: LlmRequest[] = [];
  const transport: LlmTransport = {
    model: 'scripted',
    async create(req) {
      requests.push(structuredClone({ ...req, signal: undefined }) as unknown as LlmRequest);
      const next = turns.shift();
      if (!next) throw new Error('script exhausted');
      return next;
    },
  };
  return { transport, requests };
}

const use = (id: string, name: string, input: Record<string, unknown>) => ({ type: 'tool_use', id, name, input });

afterEach(() => setTransport(undefined));

describe('agent harness', () => {
  it('runs a grounded look -> say loop and echoes tool results', async () => {
    const looked: string[] = [];
    const kit: Toolkit = {
      persona: 'test',
      observe: () => 'world',
      tools: [{ name: 'look', description: 'look', input_schema: { type: 'object', properties: { what: { type: 'string' } }, required: ['what'] }, run: ({ what }) => (looked.push(String(what)), 'a red mug') }],
    };
    const { transport, requests } = scripted([
      { stop_reason: 'tool_use', content: [{ type: 'thinking' }, use('t1', 'look', { what: 'table' })] },
      { stop_reason: 'tool_use', content: [use('t2', 'say', { text: 'It is the **red** mug.' })] },
      { stop_reason: 'end_turn', content: [] },
    ]);
    const said: string[] = [];
    const out = await runAgent(transport, { system: 's', user: 'u', kit, onSay: (t) => said.push(t) });
    expect(out.ok).toBe(true);
    expect(looked).toEqual(['table']);
    expect(said).toEqual(['It is the red mug.']);
    expect(out.steps.map((s) => s.tool)).toEqual(['look', 'say']);
    // The assistant turn (with its thinking block) is sent back unchanged, followed by the tool result.
    const second = requests[1].messages;
    expect(second[1]).toEqual({ role: 'assistant', content: [{ type: 'thinking' }, use('t1', 'look', { what: 'table' })] });
    expect(second[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'a red mug' }] });
  });

  it('bounces a misleading line back to the model (guardrail) and refuses bad tool input', async () => {
    const kit: Toolkit = { persona: '', observe: () => '', tools: [], vetSay: (t) => (/left/.test(t) ? 'Their left is your right.' : null) };
    const { transport, requests } = scripted([
      { stop_reason: 'tool_use', content: [use('a', 'say', { text: 'On your left!' }), use('b', 'fly', {}), use('c', 'say', { words: 1 })] },
      { stop_reason: 'tool_use', content: [use('d', 'say', { text: 'On your right!' })] },
      { stop_reason: 'end_turn', content: [] },
    ]);
    const said: string[] = [];
    const out = await runAgent(transport, { system: '', user: '', kit, onSay: (t) => said.push(t) });
    expect(said).toEqual(['On your right!']);
    const results = (requests[1].messages[2].content as { content: string; is_error?: boolean }[]).map((r) => r.content);
    expect(results[0]).toMatch(/^NOT SAID\. Their left is your right\./);
    expect(results[1]).toMatch(/no tool called fly/);
    expect(results[2]).toMatch(/Invalid input/);
    expect(out.steps).toHaveLength(4);
  });

  it('gives up at the deadline instead of stalling the game', async () => {
    const never: LlmTransport = { model: 'slow', create: (req) => new Promise((_, reject) => req.signal.addEventListener('abort', () => reject(new Error('aborted')))) };
    const out = await runAgent(never, { system: '', user: '', kit: { persona: '', observe: () => '', tools: [] }, timeoutMs: 30, onSay: () => undefined });
    expect(out.ok).toBe(false);
    expect(out.error).toBe('timeout');
  });

  it('checks tool inputs against the schema', () => {
    const schema = { type: 'object' as const, properties: { n: { type: 'integer' as const }, s: { type: 'string' as const, enum: ['a', 'b'] } }, required: ['n'] };
    expect(checkInput(schema, { n: 2, s: 'a' })).toBeNull();
    expect(checkInput(schema, { s: 'a' })).toMatch(/missing/);
    expect(checkInput(schema, { n: 1.5 })).toMatch(/integer/);
    expect(checkInput(schema, { n: 1, s: 'c' })).toMatch(/one of/);
    expect(checkInput(schema, { n: 1, x: 1 })).toMatch(/unknown/);
  });
});

function io(role: 'guide' | 'builder', log: string[], traces: Omit<AgentTrace, 'id' | 't' | 'role'>[]): BotIO {
  return { difficulty: 'normal', rng: createRng(7), id: `ai-${role}`, role, say: (t) => log.push(t), trace: (t) => traces.push(t), transcript: () => [] };
}

describe('partner brain', () => {
  it('falls back to the rule brain when the LLM fails', async () => {
    const { transport } = scripted([]);
    const fallback = vi.fn();
    const brain = new PartnerBrain(io('guide', [], []), 'study', () => ({ persona: '', observe: () => '', tools: [] }), transport);
    brain.handle('hello', fallback);
    await vi.waitFor(() => expect(fallback).toHaveBeenCalledTimes(1));
  });

  it('lets the LLM answer the builder, but never with a description that points at the wrong object', async () => {
    const scene: SceneState = {
      layoutId: 't',
      landmarks: [{ id: 'L0', kind: 'lamp', name: 'lamp', color: 'yellow', cell: { c: 3, r: 1 } }],
      objects: [
        { id: 'a', kind: 'rocket', color: 'white', size: 'regular', cell: { c: 1, r: 1 }, yaw: 0 },
        { id: 'b', kind: 'rocket', color: 'white', size: 'regular', cell: { c: 5, r: 1 }, yaw: 0 },
      ],
    };
    const mission: FindMission = { id: 'm1', index: 0, type: 'find', targetId: 'a', target: { kind: 'rocket' }, modelAnswer: 'Pick up the rocket on your left.', hint: '' };
    const { transport } = scripted([
      // From the guide's own side the target IS on the left, so the first try is wrong for the builder.
      { stop_reason: 'tool_use', content: [use('1', 'say', { text: 'The rocket on your right.' })] },
      { stop_reason: 'tool_use', content: [use('2', 'describe_target', {})] },
      { stop_reason: 'tool_use', content: [use('3', 'say', { text: 'The rocket on your left, next to nothing else.' })] },
      { stop_reason: 'end_turn', content: [] },
    ]);
    setTransport(transport);
    const said: string[] = [];
    const traces: Omit<AgentTrace, 'id' | 't' | 'role'>[] = [];
    const bot = createTabletopBot(io('guide', said, traces), { scene: () => scene, mission: () => mission, held: () => null, hover: () => undefined, pick: () => undefined, place: () => undefined });
    bot.onChat({ id: 'x', t: 1, at: Date.now(), playerId: 'h', name: 'Human', role: 'builder', text: 'Which rocket do you mean?', via: 'text' });
    await vi.waitFor(() => expect(traces.some((t) => t.brain === 'llm')).toBe(true));
    bot.dispose();
    expect(said).toEqual(['The rocket on your left, next to nothing else.']);
    const trace = traces.find((t) => t.brain === 'llm')!;
    expect(trace.steps[0].result).toMatch(/^NOT SAID/);
    expect(trace.steps[1].tool).toBe('describe_target');
  });
});

describe('OpenAI-compatible transport (DeepSeek / Qwen / GLM)', () => {
  it('translates the tool-use transcript into OpenAI chat messages and back', async () => {
    const { toOpenAiMessages } = await import('../server/agent/harness');
    const msgs = toOpenAiMessages('sys', [
      { role: 'user', content: 'Guide says: "the small rocket"' },
      { role: 'assistant', content: [{ type: 'reasoning', text: 'think' }, { type: 'text', text: 'Looking.' }, { type: 'tool_use', id: 'c1', name: 'find_objects', input: { description: 'small rocket' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'o3 (small rocket)' }] },
    ]);
    expect(msgs).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'Guide says: "the small rocket"' },
      { role: 'assistant', content: 'Looking.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'find_objects', arguments: '{"description":"small rocket"}' } }], reasoning_content: 'think' },
      { role: 'tool', tool_call_id: 'c1', content: 'o3 (small rocket)' },
    ]);
  });

  it('switches reasoning per model family and parses fenced JSON replies', async () => {
    const { thinkingParams, parseJsonReply } = await import('../server/services/openai-compat');
    expect(thinkingParams('deepseek-v4-flash', false)).toEqual({ thinking: { type: 'disabled' } });
    expect(thinkingParams('qwen3.6-35b-a3b', false)).toEqual({ enable_thinking: false });
    expect(thinkingParams('glm-5.3', true)).toEqual({ thinking: { type: 'enabled' } });
    expect(thinkingParams('gpt-5', false)).toEqual({});
    expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonReply('Sure! {"items":[1,2]} hope that helps')).toEqual({ items: [1, 2] });
    expect(parseJsonReply('no json here')).toBeNull();
  });

  it('adds /v1 to bare gateway URLs only', async () => {
    const { openaiBase } = await import('../server/config');
    expect(openaiBase('http://35.0.0.1:3888')).toBe('http://35.0.0.1:3888/v1');
    expect(openaiBase('https://api.deepseek.com/')).toBe('https://api.deepseek.com/v1');
    expect(openaiBase('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
  });
});

describe('Hyper3D CLI backend', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('counts as signed in only when a credentials file was saved', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { cliLoggedIn } = await import('../agent/hyper3d');
    const dir = mkdtempSync(join(tmpdir(), 'hyper3d-'));
    vi.stubEnv('HYPER3D_CONFIG_DIR', join(dir, 'missing'));
    expect(cliLoggedIn()).toBe(false);
    // An expired login leaves the directory; the update check writes its own cache there.
    vi.stubEnv('HYPER3D_CONFIG_DIR', dir);
    writeFileSync(join(dir, 'update-check.json'), '{}');
    expect(cliLoggedIn()).toBe(false);
    writeFileSync(join(dir, `${'ab'.repeat(32)}.json`), '{}');
    expect(cliLoggedIn()).toBe(true);
  });

  it('reads JSON after any notices the CLI prints first', async () => {
    const { parseCliJson } = await import('../agent/hyper3d');
    expect(parseCliJson('Update available: 0.2.1\n{"generation_id":"g1","status":"completed"}')).toEqual({ generation_id: 'g1', status: 'completed' });
    expect(() => parseCliJson('Not authenticated. Run hyper3d auth login.')).toThrow(/no JSON/);
  });
});
