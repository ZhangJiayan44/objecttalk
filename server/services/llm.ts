import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { entityLabel, freeCells, sceneEntities } from '../../shared/spatial';
import type { SessionReport } from '../../shared/analysis';
import type { MissionType, SceneState } from '../../shared/types';
import { config } from '../config';

/**
 * Optional Claude layer. The game never depends on it: the rule-based NLU and
 * coach handle everything offline. When ANTHROPIC_API_KEY is set, Claude
 *   1. interprets instructions the rule parser could not (AI builder fallback)
 *   2. adds personalised rewrites to the post-game report.
 * Both calls are short structured outputs at low effort, with server-side
 * refusal fallback enabled.
 */

const client = config.llm.enabled ? new Anthropic({ apiKey: config.llm.apiKey, timeout: 12_000, maxRetries: 1 }) : null;

export const llmEnabled = () => !!client;

const Interpretation = z.object({
  intent: z.enum(['pick', 'place', 'question', 'unclear']),
  objectId: z.string().nullable().describe('id of the object to pick or move, from the list'),
  cell: z
    .object({ c: z.number().int(), r: z.number().int() })
    .nullable()
    .describe('destination cell for place, from the free-cell list'),
  reply: z.string().describe('one short sentence the builder says back to the guide'),
});
export type Interpretation = z.infer<typeof Interpretation>;

const SYSTEM = `You play the BUILDER in ObjectTalk, a two-player English communication game.
The table is a grid: column c = 0..5 from west to east, row r = 0..2 from north to south.
You stand on the SOUTH side looking north, so YOUR left is lower c, YOUR right is higher c,
and "closer to you" / "in front" is higher r. The GUIDE stands on the NORTH side facing you,
so the guide's left is YOUR right and the guide's "in front of" is YOUR "behind".
"my" in the guide's message means the guide's view, "your" means yours.
Decide which object the guide means and, for place, which free cell.
If the instruction fits more than one object or cell, use intent "question" and ask one short clarifying question.
Never invent ids or cells that are not listed.`;

function describeScene(scene: SceneState) {
  const lines = sceneEntities(scene).map((e) => `- ${e.landmark ? 'landmark' : `object id=${e.id}`}: ${entityLabel(e)} at c=${e.cell.c}, r=${e.cell.r}`);
  return lines.join('\n');
}

/** Ask Claude to interpret a guide instruction. Returns null when unavailable or on any failure. */
export async function interpretInstruction(args: { text: string; scene: SceneState; missionType: MissionType; heldId: string | null }): Promise<Interpretation | null> {
  if (!client) return null;
  const free = freeCells(args.scene, args.heldId ?? undefined).map((c) => `(${c.c},${c.r})`).join(' ');
  try {
    const res = await client.beta.messages.parse({
      model: config.llm.model,
      max_tokens: 2048,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'low', format: betaZodOutputFormat(Interpretation) },
      messages: [
        {
          role: 'user',
          content: `Table:\n${describeScene(args.scene)}\nFree cells: ${free}\nCurrent task type: ${args.missionType}${args.heldId ? `\nYou are holding object ${args.heldId}.` : ''}\n\nGuide says: "${args.text}"`,
        },
      ],
    });
    if (res.stop_reason === 'refusal') return null;
    return res.parsed_output ?? null;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.warn(`[llm] interpret failed: ${err.status} ${err.message}`);
    else console.warn('[llm] interpret failed:', (err as Error).message);
    return null;
  }
}

const Coaching = z.object({
  summary: z.string().describe('two sentences of encouraging, specific feedback'),
  rewrites: z
    .array(z.object({ original: z.string(), better: z.string(), why: z.string() }))
    .describe('up to 3 of the player\'s unclear sentences rewritten from the listener\'s perspective'),
});
export type Coaching = z.infer<typeof Coaching>;

/** Personalised coaching on top of the rule-based report. */
export async function coachWithClaude(report: SessionReport): Promise<Coaching | null> {
  if (!client) return null;
  const lines = report.reviews
    .map((r) => `[${r.role}] "${r.text}" -> ${r.verdict}${r.issues.length ? ` (${r.issues.map((i) => i.type).join(', ')})` : ''}${r.suggestion ? ` | model answer: ${r.suggestion}` : ''}`)
    .join('\n');
  if (!lines) return null;
  try {
    const res = await client.beta.messages.parse({
      model: config.llm.model,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system:
        'You are a friendly English speaking coach for teenagers and university students practising spatial language in a two-player game. Players stand on opposite sides of a table, so left/right and front/behind flip. Be concrete and short. Use simple English.',
      output_config: { effort: 'low', format: betaZodOutputFormat(Coaching) },
      messages: [
        {
          role: 'user',
          content: `Clarity score ${report.clarity}/100, ${report.missionsDone}/${report.missionsTotal} missions, ${report.mistakes} mistakes.\nTranscript review:\n${lines}`,
        },
      ],
    });
    if (res.stop_reason === 'refusal') return null;
    const out = res.parsed_output;
    return out ? { ...out, rewrites: out.rewrites.slice(0, 3) } : null;
  } catch (err) {
    console.warn('[llm] coaching failed:', (err as Error).message);
    return null;
  }
}
