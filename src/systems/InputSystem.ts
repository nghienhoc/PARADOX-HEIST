import Phaser from 'phaser';
import { DASH } from '@/config/balance';
import { KEYS, type ControlAction } from '@/config/controls';

/**
 * Single source of truth for player input.
 *
 * Presses are **latched on the keydown event**, not polled. This matters:
 * `Phaser.Input.Keyboard.JustDown` is a polled flag that `Key.onUp()` clears, so a tap
 * whose keydown and keyup both land inside one rendered frame is lost entirely. At
 * 60 FPS a human tap spans several frames and usually survives, but on a slow frame —
 * exactly when the player is already having a bad time — a dash or a timeline reset
 * would silently vanish.
 *
 * Latching makes a press impossible to miss regardless of frame timing, and gives the
 * input buffering the spec asks for (MASTER_GAME_SPEC.md §5) for free.
 */
export class InputSystem {
  /** Normalised movement direction for this frame. */
  readonly move = new Phaser.Math.Vector2();

  private readonly bindings = new Map<ControlAction, Phaser.Input.Keyboard.Key[]>();
  /** Presses latched since the last `update()`, waiting to be consumed. */
  private readonly latched = new Set<ControlAction>();
  private readonly pressedThisFrame = new Set<ControlAction>();
  private readonly heldThisFrame = new Set<ControlAction>();
  /** Kept so the listeners can be detached on shutdown. */
  private readonly listeners: Array<{ key: Phaser.Input.Keyboard.Key; handler: () => void }> = [];

  private dashBufferedUntil = -Infinity;
  private firing = false;

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      console.warn('[InputSystem] Keyboard plugin unavailable; keyboard input disabled.');
      return;
    }

    for (const action of Object.keys(KEYS) as ControlAction[]) {
      const keys = KEYS[action].map((name) => {
        // emitOnRepeat = false, so holding a key does not re-latch every OS repeat.
        const key = keyboard.addKey(name, true, false);
        const handler = (): void => {
          this.latched.add(action);
        };
        key.on(Phaser.Input.Keyboard.Events.DOWN, handler);
        this.listeners.push({ key, handler });
        return key;
      });
      this.bindings.set(action, keys);
    }

    // Stop the browser scrolling / activating UI on gameplay keys.
    keyboard.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
  }

  /** Refresh the per-frame snapshot. Call once, at the top of the scene update. */
  update(timeMs: number): void {
    // Drain latched presses into this frame's snapshot.
    this.pressedThisFrame.clear();
    for (const action of this.latched) this.pressedThisFrame.add(action);
    this.latched.clear();

    this.heldThisFrame.clear();
    for (const [action, keys] of this.bindings) {
      for (const key of keys) {
        if (key.isDown) {
          this.heldThisFrame.add(action);
          break;
        }
      }
    }

    const x = (this.heldThisFrame.has('right') ? 1 : 0) - (this.heldThisFrame.has('left') ? 1 : 0);
    const y = (this.heldThisFrame.has('down') ? 1 : 0) - (this.heldThisFrame.has('up') ? 1 : 0);
    this.move.set(x, y);
    if (x !== 0 && y !== 0) this.move.normalize();

    if (this.pressedThisFrame.has('dash')) {
      this.dashBufferedUntil = timeMs + DASH.bufferMs;
    }

    const pointer = this.scene.input.activePointer;
    // Refresh the world point every frame: `worldX/worldY` are only recomputed on
    // pointer movement, so a scrolling camera would otherwise leave aim stale.
    pointer.updateWorldPoint(this.scene.cameras.main);
    this.firing = pointer.isDown && pointer.leftButtonDown();
  }

  isDown(action: ControlAction): boolean {
    return this.heldThisFrame.has(action);
  }

  justPressed(action: ControlAction): boolean {
    return this.pressedThisFrame.has(action);
  }

  /** True while the left mouse button is held (weapons auto-fire on hold). */
  get isFiring(): boolean {
    return this.firing;
  }

  /**
   * Take a buffered dash request, if one is still valid.
   * Buffering makes a dash pressed a few frames early still register.
   */
  consumeDash(timeMs: number): boolean {
    if (timeMs > this.dashBufferedUntil) return false;
    this.dashBufferedUntil = -Infinity;
    return true;
  }

  /** Aim target in world space. */
  get aimX(): number {
    return this.scene.input.activePointer.worldX;
  }

  get aimY(): number {
    return this.scene.input.activePointer.worldY;
  }

  /** Drop any buffered state — used across a timeline reset. */
  clearBuffers(): void {
    this.dashBufferedUntil = -Infinity;
    this.pressedThisFrame.clear();
    this.latched.clear();
  }

  /** Detach every keyboard listener. Must be called on scene shutdown. */
  destroy(): void {
    for (const { key, handler } of this.listeners) {
      key.off(Phaser.Input.Keyboard.Events.DOWN, handler);
    }
    this.listeners.length = 0;
    this.bindings.clear();
    this.latched.clear();
    this.pressedThisFrame.clear();
    this.heldThisFrame.clear();
  }
}
