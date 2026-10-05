import { pickL10n, type L10n, type TeamConfig } from '@troupe/team-config';
import type { TeamEventsApi } from '@troupe/team-events';

/**
 * SimulationEngine is the stand-in producer. It is a director, not a random
 * jitter source: scenes play on a schedule, then the next cycle starts.
 *
 * SCRIPT-SOURCE: crew/<role>/behavior.json is the internal performer script
 * (dev branch). This module is the public runtime snapshot so `main` still
 * runs when crew/ is absent. Both describe the same claim → work → emit →
 * handoff loop.
 *
 * REAL-SOURCE: swap this producer for RealtimeAdapter via TeamEvents.setAdapter.
 * Renderers only subscribe to the bus.
 */
export class SimulationEngine {
  private stopped = false;
  private alert = false;
  private sceneLock = false;
  private held = new Set<string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private intervals = new Set<ReturnType<typeof setInterval>>();
  private reviewCursor = 0;
  private cycle = 0;
  private poseTick = 0;
  private poseSlot: Record<string, number> = {};
  private taskCursor = 0;
  private tokenIndex = 0;
  private tokenRatio: number;
  private suspended = false;
  private readonly tokenScript = [62, 68, 74, 80, 88, 96, 104, 112, 122, 122, 64];

  constructor(
    private readonly bus: TeamEventsApi,
    private readonly config: TeamConfig,
  ) {
    this.tokenRatio = config.costs.baseline;
  }

  start(): void {
    this.boot();
    this.every(4000, () => this.wander());
    this.every(12000, () => this.kpiPulse());
    this.every(7000, () => this.ambient());
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    for (const timer of this.intervals) clearInterval(timer);
    this.timers.clear();
    this.intervals.clear();
  }

  private every(ms: number, fn: () => void): void {
    const id = setInterval(() => {
      if (!this.stopped) fn();
    }, ms);
    this.intervals.add(id);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.stopped) {
        resolve();
        return;
      }
      const id = setTimeout(() => {
        this.timers.delete(id);
        resolve();
      }, ms);
      this.timers.add(id);
    });
  }

  private emit(type: string, actor: string, action: L10n, payload: Record<string, unknown> = {}): void {
    if (this.stopped) return;
    this.bus.push({
      type,
      actor,
      action: action['zh-CN'],
      ts: Date.now(),
      payload: { actionL10n: action, ...payload },
    });
  }

  private boot(): void {
    for (const member of this.config.members) {
      this.poseSlot[member.id] = member.id.length % 3;
      this.emit('member_online', member.id, { en: 'is online', 'zh-CN': '上线' }, { quiet: true });
      this.emit('task_started', member.id, member.task, {
        progress: member.progress,
        station: member.station,
        quiet: true,
      });
    }
    this.emit(
      'cost_report',
      'main-agent',
      { en: 'Token baseline posted', 'zh-CN': 'Token 基线已挂出' },
      { used: this.tokenRatio, budget: this.config.costs.budget, ratio: this.tokenRatio },
    );
    this.wander();
  }

  private hold(ids: string[]): void {
    this.held = new Set(ids);
  }

  private releaseHold(): void {
    this.held.clear();
  }

  private async loop(): Promise<void> {
    await this.wait(1200);
    while (!this.stopped) {
      const cycle = this.cycle++;
      await this.playStandup();
      await this.playDm();
      await this.playHuddle();
      await this.playReview();
      if (cycle % 2 === 1) {
        const script = this.config.escalation[cycle % 4 === 3 ? 1 : 0] ?? this.config.escalation[0];
        await this.playEscalation(script.level, script.actor, script.action);
      }
      await this.playSprint(cycle);
      if (cycle % 2 === 0) await this.playWeekly();
      await this.playSignoff(cycle % 3 === 2 ? 'rejected' : 'approved');
      await this.playScoring();
      await this.wait(2000);
    }
  }

  private async playStandup(): Promise<void> {
    if (this.stopped) return;
    this.sceneLock = true;
    const attendees = this.config.standup.map((line) => line.actor);
    this.hold(attendees);
    this.emit(
      'scene_cue',
      'main-agent',
      { en: 'Daily standup is live', 'zh-CN': '每日站会开始' },
      { scene: 'standup', phase: 'start', attendees, status: 'meeting' },
    );
    this.emit(
      'report_standup',
      'main-agent',
      { en: 'Opened the standup', 'zh-CN': '站会开场' },
      { attendees },
    );
    for (const line of this.config.standup) {
      await this.wait(3000);
      if (this.stopped) return;
      this.emit('meeting_speech', line.actor, line.line, { scene: 'standup' });
    }
    await this.wait(900);
    this.emit(
      'scene_cue',
      'main-agent',
      { en: 'Standup closed', 'zh-CN': '站会结束' },
      { scene: 'standup', phase: 'end', attendees, status: 'working' },
    );
    this.releaseHold();
    this.sceneLock = false;
  }

  private async playDm(): Promise<void> {
    if (this.stopped) return;
    const dm = this.config.dms[0];
    this.sceneLock = true;
    this.hold([dm.from, dm.to]);
    this.emit(
      'scene_cue',
      dm.from,
      { en: 'Private thread opened', 'zh-CN': '私聊开始' },
      { scene: 'dm', phase: 'start', attendees: [dm.from, dm.to], status: 'dm' },
    );
    this.emit(
      'dm_message',
      dm.from,
      { en: 'in a private thread', 'zh-CN': '私聊中' },
      { to: dm.to, text: dm.text, end: false },
    );
    await this.wait(5200);
    if (this.stopped) return;
    this.emit(
      'dm_message',
      dm.from,
      { en: 'left the thread undecided', 'zh-CN': '私聊未决' },
      { to: dm.to, end: true, resolved: false },
    );
    this.emit(
      'scene_cue',
      dm.from,
      { en: 'Private thread closed', 'zh-CN': '私聊结束' },
      { scene: 'dm', phase: 'end', attendees: [dm.from, dm.to], status: 'working' },
    );
    this.releaseHold();
    this.sceneLock = false;
  }

  private async playHuddle(): Promise<void> {
    if (this.stopped) return;
    const attendees = this.config.huddle.attendees;
    this.sceneLock = true;
    this.hold(attendees);
    this.emit(
      'scene_cue',
      'main-agent',
      { en: 'Huddle called for the people involved', 'zh-CN': '相关人碰头' },
      { scene: 'huddle', phase: 'start', attendees, status: 'huddle' },
    );
    await this.wait(2800);
    if (this.stopped) return;
    this.emit('alignment_done', 'main-agent', this.config.huddle.outcome, {
      scene: 'huddle',
      attendees,
      level: 'L1',
    });
    await this.wait(800);
    this.emit(
      'scene_cue',
      'main-agent',
      { en: 'Huddle dismissed', 'zh-CN': '碰头散会' },
      { scene: 'huddle', phase: 'end', attendees, status: 'working' },
    );
    this.releaseHold();
    this.sceneLock = false;
  }

  private async playReview(): Promise<void> {
    if (this.stopped) return;
    this.sceneLock = true;
    const batch = 6;
    const slice = Array.from({ length: batch }, (_, index) => {
      return this.config.reviews[(this.reviewCursor + index) % this.config.reviews.length];
    });
    this.reviewCursor = (this.reviewCursor + batch) % this.config.reviews.length;
    const attendees = [...new Set(slice.map((item) => item.reviewer))];
    const dock: Record<string, number> = {};
    for (const item of slice) dock[item.reviewer] = (dock[item.reviewer] ?? 0) + 1;
    this.hold(attendees);
    this.emit(
      'scene_cue',
      attendees[0] ?? 'reviewer-product',
      { en: 'P1 asset pre-review is live', 'zh-CN': 'P1 资产预审开始' },
      { scene: 'review', phase: 'start', attendees, status: 'reviewing', dock, agenda: this.config.reviewAgenda },
    );
    for (const item of slice) {
      await this.wait(2000);
      if (this.stopped) return;
      this.emit('review_comment', item.reviewer, item.text, {
        reviewId: item.id,
        round: item.round,
        closed: false,
      });
      await this.wait(1200);
      if (this.stopped) return;
      this.emit('review_comment', item.reviewer, item.resolution, {
        reviewId: item.id,
        round: item.round,
        closed: true,
        resolve: true,
      });
    }
    this.emit(
      'scene_cue',
      attendees[0] ?? 'reviewer-product',
      { en: 'Review sitting closed', 'zh-CN': '本场预审收束' },
      { scene: 'review', phase: 'end', attendees, status: 'working' },
    );
    this.releaseHold();
    this.sceneLock = false;
  }

  private async playEscalation(level: 'P0' | 'P1', actor: string, action: L10n): Promise<void> {
    if (this.stopped) return;
    this.alert = true;
    this.sceneLock = true;
    this.emit('escalation_urgent', actor, action, { level });
    await this.wait(8000);
    if (this.stopped) return;
    this.emit(
      'alert_cleared',
      'main-agent',
      level === 'P0'
        ? { en: 'P0 alert cleared. Scope stays frozen.', 'zh-CN': 'P0 警报解除，范围维持冻结。' }
        : { en: 'P1 alert cleared. Planning close continues.', 'zh-CN': 'P1 警报解除，规划收口继续。' },
      { level },
    );
    this.alert = false;
    this.sceneLock = false;
  }

  private async playSprint(cycle: number): Promise<void> {
    if (this.stopped) return;
    this.sceneLock = true;
    this.emit(
      'scene_cue',
      'main-agent',
      { en: 'Implementation sprint chips are moving', 'zh-CN': '实现冲刺，任务芯片流动' },
      { scene: 'sprint', phase: 'start', attendees: [], status: 'working' },
    );
    let index = 0;
    for (const handoff of this.config.handoffs) {
      await this.wait(1600);
      if (this.stopped) return;
      this.emit('task_handoff', handoff.actor, handoff.title, {
        fromZone: handoff.fromZone,
        toZone: handoff.toZone,
        chipId: `chip-${cycle}-${index++}`,
        title: handoff.title,
      });
    }
    await this.wait(600);
    this.emit(
      'scene_cue',
      'main-agent',
      { en: 'Sprint handoff complete', 'zh-CN': '冲刺交接完成' },
      { scene: 'sprint', phase: 'end', attendees: [], status: 'working' },
    );
    this.sceneLock = false;
  }

  private async playWeekly(): Promise<void> {
    if (this.stopped) return;
    this.sceneLock = true;
    this.emit('report_weekly', this.config.weekly.actor, this.config.weekly.line, { scene: 'weekly' });
    await this.wait(1600);
    this.sceneLock = false;
  }

  private async playSignoff(decision: 'approved' | 'rejected'): Promise<void> {
    if (this.stopped) return;
    this.sceneLock = true;
    const session = `signoff-${this.cycle}`;
    this.emit('version_signoff', 'main-agent', this.config.signoff.summary, {
      step: 'summary',
      session,
      scene: 'signoff',
    });
    await this.wait(2200);
    if (this.stopped) return;
    this.emit('version_signoff', 'main-agent', this.config.signoff.present, {
      step: 'present',
      session,
      scene: 'signoff',
    });
    await this.wait(2200);
    if (this.stopped) return;
    const note = decision === 'approved' ? this.config.signoff.approved : this.config.signoff.rejected;
    this.emit('version_signoff', 'chairman', note, {
      step: 'decision',
      decision,
      session,
      scene: 'signoff',
    });
    await this.wait(1400);
    this.sceneLock = false;
  }

  private async playScoring(): Promise<void> {
    if (this.stopped) return;
    this.sceneLock = true;
    const session = `score-${this.cycle}`;
    this.emit(
      'scene_cue',
      'main-agent',
      { en: 'Version scoring ceremony', 'zh-CN': '版本考评仪式' },
      { scene: 'scoring', phase: 'start', attendees: [], session },
    );
    for (const score of this.config.scores) {
      await this.wait(700);
      if (this.stopped) return;
      this.emit(
        'review_score',
        score.from,
        {
          en: `scored ${score.to} ${score.score}/5`,
          'zh-CN': `给 ${score.to} 打了 ${score.score}/5`,
        },
        { to: score.to, score: score.score, axis: score.axis, session },
      );
    }
    await this.wait(600);
    this.emit('review_score', 'main-agent', this.config.scoreSummary, {
      to: 'chairman',
      axis: 'summary',
      session,
    });
    this.emit(
      'scene_cue',
      'main-agent',
      { en: 'Scoring filed to the chairman', 'zh-CN': '考评已呈董事长' },
      { scene: 'scoring', phase: 'end', session },
    );
    this.sceneLock = false;
  }

  private wander(): void {
    if (this.alert) return;
    this.poseTick += 1;
    const slots: Record<string, number> = {};
    this.config.members.forEach((member, index) => {
      const current = this.poseSlot[member.id] ?? 0;
      let next = current;
      if (!this.held.has(member.id) && (this.poseTick + index) % 2 === 0) {
        next = (current + 1) % 3;
      }
      this.poseSlot[member.id] = next;
      slots[member.id] = next;
    });
    this.emit(
      'member_pose',
      'main-agent',
      { en: 'shifted inside the zone', 'zh-CN': '在本产区换位' },
      { slots },
    );
  }

  private ambient(): void {
    if (this.alert || this.sceneLock) return;
    const member = this.config.members[this.taskCursor % this.config.members.length];
    this.taskCursor += 1;
    const progress = Math.min(0.92, member.progress + ((this.taskCursor % 5) + 1) * 0.08);
    this.emit('task_progress', member.id, member.task, {
      progress,
      station: member.station,
    });
  }

  private kpiPulse(): void {
    this.bumpToken();
    this.bumpTask();
  }

  private bumpToken(): void {
    const previous = this.tokenRatio;
    const ratio = this.tokenScript[this.tokenIndex % this.tokenScript.length];
    this.tokenIndex += 1;
    this.tokenRatio = ratio;
    this.emit(
      'cost_report',
      'main-agent',
      { en: `Token load ${ratio}%`, 'zh-CN': `Token 水位 ${ratio}%` },
      { used: ratio, budget: this.config.costs.budget, ratio },
    );
    for (const threshold of this.config.costs.thresholds) {
      if (previous < threshold && ratio >= threshold) {
        this.emit(
          'budget_alert',
          'main-agent',
          {
            en: `Token watermark ${threshold} crossed`,
            'zh-CN': `Token 水位线 ${threshold} 已越过`,
          },
          { threshold, ratio },
        );
      }
    }
    if (!this.suspended && ratio >= 120) {
      this.suspended = true;
      for (const member of this.config.members) {
        if (member.id === 'main-agent') continue;
        this.emit(
          'member_offline',
          member.id,
          { en: 'suspended under the stop-work plan', 'zh-CN': '停职预案，进入休眠' },
          { suspended: true },
        );
      }
    }
    if (this.suspended && ratio < 70) {
      this.suspended = false;
      for (const member of this.config.members) {
        if (member.id === 'main-agent') continue;
        this.emit(
          'member_online',
          member.id,
          { en: 'reinstated', 'zh-CN': '复职' },
          { suspended: false },
        );
      }
    }
  }

  private bumpTask(): void {
    const open = this.config.members.filter((member) => member.progress < 1);
    if (open.length === 0) return;
    const member = open[this.taskCursor % open.length];
    const done = this.taskCursor % 4 === 0;
    if (done) {
      this.emit(
        'task_done',
        member.id,
        {
          en: `Wrapped: ${pickL10n(member.task, 'en')}`,
          'zh-CN': `完成：${pickL10n(member.task, 'zh-CN')}`,
        },
        { progress: 1, station: member.station, asset: this.taskCursor % 8 === 0 },
      );
      return;
    }
    this.emit('task_progress', member.id, member.task, {
      progress: Math.min(0.95, member.progress + 0.12 + (this.taskCursor % 3) * 0.05),
      station: member.station,
    });
  }
}
