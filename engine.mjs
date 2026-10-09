const TARGET_SPEED = 100;
const MAX_SPEED = 200;
const ACCELERATION = 31;
const BREAK_FORCE = 1600;
const FORCE_RISE = 1100;
const FORCE_FALL = 650;
const BRAKE_DECELERATION = 0.024;
const TIME_LIMIT = 30;
const EPSILON = 1e-9;

/**
 * A deterministic brake game. Speeds are km/h, force is N, and time is seconds.
 * Each update integrates to the next physical event, so frame rate does not
 * change the reaction time, distance, stopping result, or failure boundary.
 */
export class BrakeGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = 'idle';
    this.paused = false;
    this.speed = 0;
    this.force = 0;
    this.elapsed = 0;
    this.reaction = null;
    this.distance = 0;
    this.peakForce = 0;
    this.entrySpeed = null;
    this.countdown = 0;
    this.failure = null;
    this.pedal = false;
    this.travel = 0;
    this._clockStarted = false;
    return this.snapshot;
  }

  start() {
    this.reset();
    this.phase = 'countdown';
    this.countdown = 3;
    return this.snapshot;
  }

  setPedal(pressed) {
    const next = Boolean(pressed);
    if (!next) {
      this.pedal = false;
      return this.snapshot;
    }
    if (this.paused || !['accelerating', 'braking'].includes(this.phase)) {
      return this.snapshot;
    }
    if (this.pedal) return this.snapshot;

    if (!this._clockStarted) {
      this._finish('early');
      return this.snapshot;
    }

    this.pedal = true;
    if (this.reaction === null) {
      this.reaction = this.elapsed;
      this.entrySpeed = this.speed;
      this.phase = 'braking';
    }
    return this.snapshot;
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    // A key or pointer release can be lost while focus changes. Resume always
    // requires a fresh press instead of keeping the brake silently engaged.
    if (this.paused) this.pedal = false;
    return this.snapshot;
  }

  update(dtSeconds) {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || this.paused) {
      return this.snapshot;
    }

    let remaining = dtSeconds;
    while (remaining > 0 && this._isRunning()) {
      if (this.phase === 'countdown') {
        const dt = Math.min(remaining, this.countdown);
        this.countdown -= dt;
        remaining -= dt;
        if (this.countdown <= EPSILON) {
          this.countdown = 0;
          this.phase = 'accelerating';
        }
        continue;
      }

      const consumed = this.force > 0 || this.pedal
        ? this._advanceBraking(remaining)
        : this._advanceAcceleration(remaining);
      remaining = Math.max(0, remaining - consumed);
    }
    return this.snapshot;
  }

  get snapshot() {
    return {
      phase: this.phase,
      paused: this.paused,
      speed: this.speed,
      force: this.force,
      elapsed: this.elapsed,
      reaction: this.reaction,
      distance: this.distance,
      peakForce: this.peakForce,
      entrySpeed: this.entrySpeed,
      countdown: this.countdown,
      failure: this.failure,
      pedal: this.pedal,
      travel: this.travel,
    };
  }

  _isRunning() {
    return ['countdown', 'accelerating', 'braking'].includes(this.phase);
  }

  _advanceAcceleration(remaining) {
    const acceleration = this.speed < MAX_SPEED ? ACCELERATION : 0;
    const boundary = this._clockStarted ? MAX_SPEED : TARGET_SPEED;
    const untilBoundary = acceleration > 0
      ? Math.max(0, (boundary - this.speed) / acceleration)
      : Infinity;
    const untilTimeout = this._clockStarted ? TIME_LIMIT - this.elapsed : Infinity;
    const dt = Math.min(remaining, untilBoundary, untilTimeout);
    const distance = (this.speed * dt + acceleration * dt * dt / 2) / 3.6;
    this._recordMotion(dt, distance);
    this.speed = Math.min(MAX_SPEED, this.speed + acceleration * dt);

    if (!this._clockStarted && this.speed >= TARGET_SPEED - EPSILON) {
      this.speed = TARGET_SPEED;
      this._clockStarted = true;
    } else if (this._clockStarted && this.elapsed >= TIME_LIMIT - EPSILON) {
      this.elapsed = TIME_LIMIT;
      this._finish('timeout');
    }
    return dt;
  }

  _advanceBraking(remaining) {
    const forceRate = this.pedal ? FORCE_RISE : -FORCE_FALL;
    const untilForceBoundary = this.pedal
      ? Math.max(0, (BREAK_FORCE - this.force) / forceRate)
      : this.force / FORCE_FALL;
    const untilStop = this._timeUntilStop(forceRate);
    const untilTimeout = TIME_LIMIT - this.elapsed;
    const dt = Math.min(remaining, untilForceBoundary, untilStop, untilTimeout);
    const integratedForce = this.force * dt + forceRate * dt * dt / 2;
    const distance = (
      this.speed * dt - BRAKE_DECELERATION * (
        this.force * dt * dt / 2 + forceRate * dt * dt * dt / 6
      )
    ) / 3.6;
    this._recordMotion(dt, Math.max(0, distance));
    this.speed = Math.max(0, this.speed - BRAKE_DECELERATION * integratedForce);
    this.force = Math.max(0, this.force + forceRate * dt);
    this.peakForce = Math.max(this.peakForce, this.force);

    // Reaching the damage limit is a failure even if it coincides with a stop.
    if (this.force >= BREAK_FORCE - EPSILON) {
      this.force = BREAK_FORCE;
      this.peakForce = BREAK_FORCE;
      this._finish('broken');
    } else if (this.speed <= EPSILON) {
      this.speed = 0;
      this._finish(null);
    } else if (this.elapsed >= TIME_LIMIT - EPSILON) {
      this.elapsed = TIME_LIMIT;
      this._finish('timeout');
    } else if (this.force <= EPSILON) {
      this.force = 0;
    }
    return dt;
  }

  _timeUntilStop(forceRate) {
    const requiredImpulse = this.speed / BRAKE_DECELERATION;
    const discriminant = this.force * this.force + 2 * forceRate * requiredImpulse;
    if (discriminant < 0) return Infinity;
    const denominator = this.force + Math.sqrt(discriminant);
    return denominator > 0 ? 2 * requiredImpulse / denominator : Infinity;
  }

  _recordMotion(dt, distance) {
    this.travel += distance;
    if (this._clockStarted) {
      this.elapsed += dt;
      this.distance += distance;
    }
  }

  _finish(failure) {
    this.failure = failure;
    this.phase = failure ? 'failed' : 'success';
    this.pedal = false;
  }
}
