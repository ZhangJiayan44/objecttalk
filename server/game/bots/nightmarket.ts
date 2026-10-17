import { getKind } from '../../../shared/catalog';
import { lineText, objectKey, parseOrder, trayStatus, type CafeState, type OrderLine, type OrderMission } from '../../../shared/cafe';
import type { Pose } from '../../../shared/city';
import { atMeeting, MARKET_MEETING, marketDirections, marketOrderSpeech, marketRoute, nearShop, shopApproach, shopForKind, shoppingInstruction } from '../../../shared/nightmarket';
import type { ChatMessage, FxEvent } from '../../../shared/protocol';
import { PartnerBrain } from '../../agent/partner';
import type { AnyMission, BotIO } from '../engines/types';
import { BaseBot, isBackchannel } from './common';

interface MarketCtx {
  state(): CafeState | null;
  mission(): OrderMission | null;
  pose(): Pose;
  move(p: Pose): void;
  tray(id: string, add: boolean): void;
  serve(): void;
  specials: string[];
}

class MarketPartner extends BaseBot {
  private brain: PartnerBrain;
  private ticket: OrderLine[] = [];
  private path: { x: number; z: number; y?: number }[] = [];
  private returning = false;
  private nextHintAt = 0;
  private walking = false;

  constructor(io: BotIO, private ctx: MarketCtx) {
    super(io);
    this.brain = new PartnerBrain(io, 'nightmarket', () => ({
      persona: 'You hold the secret shopping list. Give ONE shop and quantity at a time. Ground directions in route, which uses the shopper’s heading. Never buy or move for them. When the bag is complete, send them to the entrance gate.',
      observe: () => this.guideLine(),
      tools: [{ name: 'route', description: 'Read the next missing shopping item and directions from the shopper’s current position, or the route back to the entrance gate.', input_schema: { type: 'object', properties: {} }, run: () => this.guideLine() }],
    }));
  }

  private guideLine() {
    const st = this.ctx.state(), m = this.ctx.mission();
    if (!st || !m) return 'Waiting for the shopping list.';
    const status = trayStatus(st, m.order);
    if (status.extra.length) {
      const extra = st.scene.objects.find((o) => o.id === status.extra[0]);
      return `Please return the extra ${extra ? getKind(extra.kind)?.name : 'item'} from your shopping bag.`;
    }
    const line = status.missing[0];
    return line ? `${shoppingInstruction(line)} ${marketDirections(this.ctx.pose(), shopForKind(line.kind))}` : `Everything is in the bag. ${marketDirections(this.ctx.pose())}`;
  }

  onMissionStart(_m: AnyMission) {
    this.ticket = [];
    this.path = [];
    this.returning = false;
    this.nextHintAt = 0;
    this.later(1000, () => {
      if (this.io.role === 'guide') this.respond('[event] new shopping list');
      else if (!this.ticket.length) this.say('Which shop first?');
    });
    if (!this.walking && this.io.role === 'builder') { this.walking = true; this.tick(); }
  }

  private respond(input: string) {
    if (!this.ctx.mission()) return;
    this.brain.handle(input, () => {
      const line = this.guideLine();
      this.say(line);
      this.traceRules(input, [{ tool: 'shopping_route', args: '', result: line }], line);
    });
  }

  onChat(msg: ChatMessage) {
    if (msg.role === this.io.role || !this.ctx.mission()) return;
    if (this.io.role === 'guide') {
      if (!isBackchannel(msg.text)) this.respond(msg.text);
      return;
    }
    // The shopper acts only on what was spoken, never on the secret order.
    const spoken = marketOrderSpeech(msg.text);
    const parsed = parseOrder(spoken, 'nightmarket', this.ctx.specials);
    if (/\b(return|remove|put back).*\b(extra|bag)\b/i.test(spoken)) {
      const st = this.ctx.state();
      const kind = parsed.lines[0]?.kind;
      const id = st?.tray.find((id) => st.scene.objects.find((o) => o.id === id)?.kind === kind);
      if (id) this.ctx.tray(id, false);
      this.ticket = this.ticket.filter((l) => l.kind !== kind);
      return;
    }
    for (const l of parsed.lines) {
      if (l.negated) { this.ticket = this.ticket.filter((x) => x.kind !== l.kind); continue; }
      if (getKind(l.kind)?.sized && !l.size) { this.say('Small or large? Please say the item and size together.'); continue; }
      if (l.qty === null && l.plural) { this.say('How many? Please say the number and item together.'); continue; }
      // Repeated route hints restate the requested total, rather than adding another order.
      const existing = this.ticket.find((x) => x.kind === l.kind && x.size === l.size);
      const line = existing ?? { kind: l.kind, size: l.size, qty: Math.min(6, l.qty ?? 1) };
      this.ticket = [...this.ticket.filter((x) => x.kind !== l.kind), line];
    }
    if (parsed.lines.length) { this.returning = false; this.path = []; }
    if (/\b(entrance|meeting point|bring.*back|hand.*over|everything is in the bag)\b/i.test(msg.text) && !parsed.lines.length) {
      this.returning = true;
      this.path = marketRoute(this.ctx.pose(), MARKET_MEETING);
    }
    this.traceRules(msg.text, [{ tool: 'parse_shopping_instruction', args: msg.text, result: JSON.stringify(this.ticket) }], '(following spoken instructions)');
  }

  private tick() {
    if (this.ctx.mission()) {
      const st = this.ctx.state();
      const pose = this.ctx.pose();
      if (st) {
        const line = this.ticket.find((l) => st.tray.filter((id) => { const o = st.scene.objects.find((x) => x.id === id); return o && objectKey(o) === `${l.kind}|${l.size ?? ''}`; }).length < l.qty);
        if (line) {
          const shop = shopForKind(line.kind);
          if (nearShop(pose, shop)) {
            const obj = st.scene.objects.find((o) => !st.tray.includes(o.id) && objectKey(o) === `${line.kind}|${line.size ?? ''}`);
            if (obj) {
              this.ctx.tray(obj.id, true);
              const got = this.ctx.state()!;
              if (!trayStatus(got, this.ticket).missing.length) this.say(`Bought ${lineText(line)}. Next shop?`);
            }
            this.path = [];
          } else if (!this.path.length) this.path = marketRoute(pose, shopApproach(shop));
        } else if (this.returning && atMeeting(pose)) {
          this.ctx.serve();
          this.returning = false;
        }
        const next = this.path[0];
        if (next) {
          const dx = next.x - pose.x, dz = next.z - pose.z, distance = Math.hypot(dx, dz);
          const step = Math.min(0.7, distance);
          this.ctx.move({ x: pose.x + dx / (distance || 1) * step, z: pose.z + dz / (distance || 1) * step, yaw: Math.atan2(-dx, -dz) });
          const moved = this.ctx.pose();
          if (Math.hypot(next.x - moved.x, next.z - moved.z) < 0.00001) this.path.shift();
        }
      }
    }
    this.later(100, () => this.tick(), false);
  }

  onPose() {
    if (this.io.role !== 'guide' || Date.now() < this.nextHintAt || !this.ctx.mission()) return;
    this.nextHintAt = Date.now() + 16000;
    if (this.quietFor() > 12) this.respond('[event] shopper asks for the next landmark');
  }

  onFx(e: FxEvent) {
    if (this.io.role === 'guide' && (e.type === 'tray' || e.type === 'wrong')) {
      this.nextHintAt = Date.now() + 16000;
      this.later(700, () => this.respond('[event] shopping bag changed'));
    }
  }
}

export const createMarketBot = (io: BotIO, ctx: MarketCtx) => new MarketPartner(io, ctx);
