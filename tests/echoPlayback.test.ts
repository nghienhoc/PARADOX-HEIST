import { describe, expect, it } from 'vitest';
import { EchoPlaybackCursor } from '@/systems/EchoPlaybackCursor';
import { EchoAction, type EchoFrame, type EchoPose, type EchoTimeline } from '@/types/echo';

function frame(time: number, x: number, y: number, actionMask = EchoAction.None): EchoFrame {
  return { time, x, y, rotation: 0, animationState: 0, actionMask };
}

function timeline(frames: EchoFrame[], id = 1): EchoTimeline {
  return { id, loopNumber: 1, frames, durationMs: frames.at(-1)?.time ?? 0 };
}

const emptyPose = (): EchoPose => ({ x: 0, y: 0, rotation: 0, animationState: 0 });

describe('EchoPlaybackCursor', () => {
  it('interpolates position between samples', () => {
    const cursor = new EchoPlaybackCursor(
      timeline([frame(0, 0, 0), frame(100, 100, 200)]),
    );
    const pose = emptyPose();

    cursor.update(50, pose);
    expect(pose.x).toBeCloseTo(50);
    expect(pose.y).toBeCloseTo(100);
  });

  it('holds the last pose after the recording ends', () => {
    const cursor = new EchoPlaybackCursor(timeline([frame(0, 0, 0), frame(100, 10, 20)]));
    const pose = emptyPose();

    cursor.update(5000, pose);
    expect(pose.x).toBe(10);
    expect(pose.y).toBe(20);
    expect(cursor.isFinished(5000)).toBe(true);
  });

  it('fires each recorded action exactly once across a whole loop', () => {
    const frames = [
      frame(0, 0, 0),
      frame(100, 0, 0, EchoAction.Shoot),
      frame(200, 0, 0),
      frame(300, 0, 0, EchoAction.Shoot),
      frame(400, 0, 0, EchoAction.Dash),
    ];
    const cursor = new EchoPlaybackCursor(timeline(frames));
    const pose = emptyPose();

    let shots = 0;
    let dashes = 0;
    // Step at a rate deliberately out of phase with the 100ms samples.
    for (let t = 0; t <= 600; t += 7) {
      const fired = cursor.update(t, pose);
      if ((fired & EchoAction.Shoot) !== 0) shots++;
      if ((fired & EchoAction.Dash) !== 0) dashes++;
    }

    expect(shots).toBe(2);
    expect(dashes).toBe(1);
  });

  it('never drops an action when a single frame spans several samples', () => {
    const frames = [
      frame(0, 0, 0),
      frame(16, 0, 0, EchoAction.Shoot),
      frame(32, 0, 0, EchoAction.Shoot),
      frame(48, 0, 0, EchoAction.Dash),
    ];
    const cursor = new EchoPlaybackCursor(timeline(frames));
    const pose = emptyPose();

    // One 500ms hitch swallows the entire timeline.
    const fired = cursor.update(500, pose);
    expect(fired & EchoAction.Shoot).toBeTruthy();
    expect(fired & EchoAction.Dash).toBeTruthy();

    // ...and nothing fires again afterwards.
    expect(cursor.update(600, pose)).toBe(EchoAction.None);
  });

  it('replays identically after reset', () => {
    const frames = [frame(0, 0, 0), frame(100, 50, 50, EchoAction.Shoot)];
    const cursor = new EchoPlaybackCursor(timeline(frames));
    const pose = emptyPose();

    const firstPass = cursor.update(200, pose);
    const firstX = pose.x;

    cursor.reset();
    const secondPass = cursor.update(200, pose);

    expect(secondPass).toBe(firstPass);
    expect(pose.x).toBe(firstX);
  });

  it('readPoseAt reads a pose without firing actions or moving the cursor', () => {
    const frames = [frame(0, 0, 0), frame(100, 100, 0, EchoAction.Shoot)];
    const cursor = new EchoPlaybackCursor(timeline(frames));
    const pose = emptyPose();

    // Peek at the end of the recording...
    cursor.readPoseAt(100, pose);
    expect(pose.x).toBe(100);

    // ...and the shot has still not fired, because peeking consumes nothing.
    let shots = 0;
    for (let t = 0; t <= 200; t += 10) {
      if ((cursor.update(t, pose) & EchoAction.Shoot) !== 0) shots++;
    }
    expect(shots).toBe(1);
  });

  it('readPoseAt interpolates like update does', () => {
    const cursor = new EchoPlaybackCursor(timeline([frame(0, 0, 0), frame(100, 100, 200)]));
    const pose = emptyPose();

    cursor.readPoseAt(50, pose);
    expect(pose.x).toBeCloseTo(50);
    expect(pose.y).toBeCloseTo(100);
  });

  it('readPoseAt is safe on an empty timeline', () => {
    const cursor = new EchoPlaybackCursor(timeline([]));
    const pose = emptyPose();
    cursor.readPoseAt(500, pose);
    expect(pose.x).toBe(0);
  });

  it('is inert for an empty timeline', () => {
    const cursor = new EchoPlaybackCursor(timeline([]));
    const pose = emptyPose();
    expect(cursor.update(1000, pose)).toBe(EchoAction.None);
    expect(pose.x).toBe(0);
  });

  it('keeps multiple cursors on the same clock synchronised', () => {
    // Two timelines recorded at the same rate, offset in space.
    const a = new EchoPlaybackCursor(timeline([frame(0, 0, 0), frame(1000, 100, 0)], 1));
    const b = new EchoPlaybackCursor(timeline([frame(0, 0, 50), frame(1000, 100, 50)], 2));

    const poseA = emptyPose();
    const poseB = emptyPose();

    for (let t = 0; t <= 1000; t += 33) {
      a.update(t, poseA);
      b.update(t, poseB);
      // Same progress along X at every shared instant.
      expect(poseA.x).toBeCloseTo(poseB.x, 6);
      expect(poseB.y - poseA.y).toBeCloseTo(50, 6);
    }
  });
});
