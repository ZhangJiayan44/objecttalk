import * as fs from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import music from '../content/levels/music-room.json';
import { finish, validateLevel, type RunState } from '../agent/level';
import { levelPlanFromLibrary } from '../agent/level-library';
import { optimizeGlb } from '../server/services/optimize';
import type { LevelBundle } from '../shared/levels';
import * as missions from '../shared/missions';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  mkdir: vi.fn(), writeFile: vi.fn(), copyFile: vi.fn(),
}));
vi.mock('../server/services/optimize', () => ({ optimizeGlb: vi.fn() }));
vi.mock('sharp', () => ({ default: () => ({ resize: () => ({ png: () => ({ toFile: async () => {} }) }) }) }));

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

const bundle = () => structuredClone(music) as LevelBundle;

describe('Scene Agent publication gate', () => {
  it('rejects unsupported engines and empty catalogs instead of validating fallback objects', () => {
    const { level, kinds } = bundle();
    expect(validateLevel({ ...level, engine: 'walknav' }, kinds, 1)).toMatchObject({ ok: false });
    expect(validateLevel(level, [], 1)).toMatchObject({ ok: false });
    expect(validateLevel(level, kinds, 0)).toMatchObject({ ok: false });
  });

  it('rejects mismatched model catalogs and Chinese scene lettering', () => {
    const { level, kinds } = bundle();
    level.generated!.kinds[0] = 'missing-model';
    expect(validateLevel(level, kinds, 1).lines.join(' ')).toMatch(/catalog/);
    level.generated!.kinds = kinds.map((kind) => kind.id);
    level.generated!.sign = '音乐教室';
    expect(validateLevel(level, kinds, 1).lines.join(' ')).toMatch(/English on scene signs/);
  });

  it('returns a useful failure for malformed JSON metadata before running a simulation', () => {
    const { level, kinds } = bundle();
    // This is possible through the JSON file accepted by level-validate.
    Object.assign(level.generated!.agent, { generations: '8' });
    const result = validateLevel(level, kinds, 1);
    expect(result.ok).toBe(false);
    expect(result.lines.join(' ')).toMatch(/level.generated.agent.generations/);
    Object.assign(level.generated!, { kinds: null });
    expect(() => validateLevel(level, kinds, 1)).not.toThrow();
  });

  it('does not publish a level when even one sampled mission is unsolvable', () => {
    vi.spyOn(missions, 'simulatePlayability').mockReturnValue({
      runs: 100, missions: 300, generated: 299, successRate: 299 / 300,
      perspectiveShare: 0.5, avgModelAnswerWords: 8, byType: { find: 199, place: 100 }, failedSeeds: [42],
    });
    const { level, kinds } = bundle();
    const report = validateLevel(level, kinds, 100);
    expect(report.ok).toBe(false);
    expect(report.lines.every((line) => line.endsWith('FAIL'))).toBe(true);
  });

  it('leaves published models untouched when a run is incomplete or fails validation', async () => {
    const plan = levelPlanFromLibrary('music');
    const state: RunState = { plan, references: {}, rejected: [], review: '', generations: {}, failed: {} };
    expect(await finish(state, () => {}, 1)).toEqual({ ok: false });

    for (const item of plan.items) {
      state.references[item.id] = { file: `refs/${item.id}.png`, from: 'test reference' };
      state.generations[item.id] = { generationId: 'test-generation', raw: `raw/${item.id}.glb`, backend: 'rest' };
    }
    plan.sign = '音乐教室';
    expect(await finish(state, () => {}, 1)).toEqual({ ok: false });
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.copyFile).not.toHaveBeenCalled();
  });

  it('keeps corrupt generated models in staging and does not overwrite the published level', async () => {
    const plan = levelPlanFromLibrary('music');
    const state: RunState = { plan, references: {}, rejected: [], review: '', generations: {}, failed: {} };
    for (const item of plan.items) {
      state.references[item.id] = { file: `refs/${item.id}.png`, from: 'test reference' };
      state.generations[item.id] = { generationId: 'test-generation', raw: `raw/${item.id}.glb`, backend: 'rest' };
    }
    vi.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('invalid GLB'));
    vi.mocked(optimizeGlb)
      .mockResolvedValueOnce({ glb: new Uint8Array([1, 2, 3]), dims: [1, 1, 1], triangles: 1 })
      .mockRejectedValueOnce(new Error('Invalid GLB'));
    await expect(finish(state, () => {}, 1)).rejects.toThrow('Invalid GLB');
    expect(fs.mkdir).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fs.mkdir).mock.calls[0][0])).toMatch(/[\\/]agent[\\/]runs[\\/]music-room[\\/]optimized$/);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fs.writeFile).mock.calls[0][0])).toMatch(/[\\/]agent[\\/]runs[\\/]music-room[\\/]optimized[\\/]/);
    expect(fs.copyFile).not.toHaveBeenCalled();
  });
});
