import Phaser from 'phaser';
import { EFFECTS } from '@/config/balance';
import { DEPTH } from '@/config/theme';
import { TEX } from '@/utils/textures';

interface Particle {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  startScale: number;
  endScale: number;
  drag: number;
}

/**
 * Fixed-size particle pool driven by a manual update loop.
 *
 * Deliberately not using tweens or Phaser's particle emitters: a plain array with
 * preallocated sprites means zero allocation per burst, an exact hard cap, and a
 * reset that is a single loop rather than a tween teardown.
 */
export class EffectsSystem {
  private readonly particles: Particle[] = [];
  private cursor = 0;

  constructor(scene: Phaser.Scene, max: number = EFFECTS.maxParticles) {
    for (let i = 0; i < max; i++) {
      const sprite = scene.add
        .image(0, 0, TEX.particle)
        .setDepth(DEPTH.effects)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setActive(false)
        .setVisible(false);

      this.particles.push({
        sprite,
        vx: 0,
        vy: 0,
        lifeMs: 0,
        maxLifeMs: 1,
        startScale: 1,
        endScale: 0,
        drag: 0.9,
      });
    }
  }

  get activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.particles.length; i++) {
      if (this.particles[i]!.sprite.active) n++;
    }
    return n;
  }

  /**
   * Emit a radial burst.
   *
   * When the pool is exhausted the oldest slot is reused rather than growing,
   * which keeps the particle budget hard-capped.
   */
  burst(
    x: number,
    y: number,
    count: number,
    color: number,
    speed: number,
    lifeMs: number,
    scale = 1,
    spreadAngle = Math.PI * 2,
    baseAngle = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.take();
      // A spread of TAU centred on any base angle is a full circle, so one
      // expression covers both omnidirectional bursts and directional cones.
      const angle = baseAngle + (Math.random() - 0.5) * spreadAngle;
      const v = speed * (0.55 + Math.random() * 0.45);

      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.lifeMs = 0;
      p.maxLifeMs = lifeMs * (0.7 + Math.random() * 0.6);
      p.startScale = scale * (0.7 + Math.random() * 0.6);
      p.endScale = 0;
      p.drag = 0.88;

      p.sprite
        .setPosition(x, y)
        .setTint(color)
        .setScale(p.startScale)
        .setAlpha(1)
        .setActive(true)
        .setVisible(true);
    }
  }

  /** A single expanding ring pulse — used for muzzle flashes and reset shockwaves. */
  pulse(x: number, y: number, color: number, fromScale: number, toScale: number, lifeMs: number): void {
    const p = this.take();
    p.vx = 0;
    p.vy = 0;
    p.lifeMs = 0;
    p.maxLifeMs = lifeMs;
    p.startScale = fromScale;
    p.endScale = toScale;
    p.drag = 1;

    p.sprite
      .setPosition(x, y)
      .setTint(color)
      .setScale(fromScale)
      .setAlpha(0.9)
      .setActive(true)
      .setVisible(true);
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      if (!p.sprite.active) continue;

      p.lifeMs += deltaMs;
      const t = p.lifeMs / p.maxLifeMs;
      if (t >= 1) {
        p.sprite.setActive(false).setVisible(false);
        continue;
      }

      const dragFactor = Math.pow(p.drag, deltaMs / 16.667);
      p.vx *= dragFactor;
      p.vy *= dragFactor;

      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.setScale(p.startScale + (p.endScale - p.startScale) * t);
      p.sprite.setAlpha(1 - t * t);
    }
  }

  /** Hide every particle immediately — called on timeline reset. */
  clear(): void {
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i]!.sprite.setActive(false).setVisible(false);
    }
  }

  private take(): Particle {
    // Prefer a free slot; fall back to round-robin stealing so the cap holds.
    for (let i = 0; i < this.particles.length; i++) {
      const index = (this.cursor + i) % this.particles.length;
      const candidate = this.particles[index]!;
      if (!candidate.sprite.active) {
        this.cursor = (index + 1) % this.particles.length;
        return candidate;
      }
    }
    const stolen = this.particles[this.cursor]!;
    this.cursor = (this.cursor + 1) % this.particles.length;
    return stolen;
  }
}
