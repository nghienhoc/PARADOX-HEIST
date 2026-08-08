MASTER DEVELOPMENT PROMPT — PARADOX HEIST
You are the principal game engineer, technical director, gameplay designer, UI/UX designer, animation director, performance engineer, sound designer, and QA lead responsible for building a complete competition-ready browser game.
Your task is to design and implement a polished web game called:

PARADOX HEIST
Tagline:

You have 20 seconds to steal the Time Core. Every failed timeline becomes your next teammate.
This must not feel like a basic coding demo, tutorial project, asset flip, generic shooter, or unfinished prototype.
It must feel like a polished indie web game that can impress judges within the first 30 seconds.
The final game must be:

Immediately playable in a browser.
Visually memorable.
Smooth and responsive.
Easy to understand.
Mechanically unique.
Fun to replay.
Technically stable.
Optimized for performance.
Built with clean and maintainable code.
Deployable as a static website.
Free of copyrighted or improperly licensed assets.
Fully functional without requiring a backend.


1. WORKING METHOD
Before changing code:

Inspect the entire repository.
Identify the current framework, structure, existing systems, assets, and problems.
Preserve any working code that is useful.
Do not blindly replace the whole repository unless the existing implementation is unusable.
Create a concise implementation plan.
Build the game in clear phases.
Run tests and production builds after major milestones.
Fix errors before continuing.
Do not leave core features as TODO comments.
Do not stop after creating only a visual mockup.
Make reasonable technical and design decisions autonomously.
Do not repeatedly ask the user for minor decisions. Choose the most polished and technically reliable solution.
When a requested feature is too expensive or risky for a browser game, implement a lighter alternative that preserves the intended experience.
The priority order is:

Stable gameplay.
Responsive controls.
Unique time-loop mechanic.
Performance.
Game feel.
Visual polish.
Additional content.


2. REQUIRED TECHNOLOGY
Preferred stack:

Vite
TypeScript
Phaser 3
HTML and CSS for the surrounding page and optional menus
Phaser WebGL renderer with Canvas fallback
Vitest for logic tests
Playwright or an equivalent tool for browser smoke testing
LocalStorage for settings, progress, scores, and unlocks
Do not use React for moving game entities or per-frame gameplay logic.
React may only be introduced if absolutely necessary for external website UI. Prefer plain HTML and CSS unless the repository already uses React.
The game must run from:

npm install
npm run dev
The production build must work with:

npm run build
npm run preview
The final output must be deployable to:

GitHub Pages
Netlify
Vercel
Any static web host
Do not require a private API key for the core game.
Do not hotlink runtime images, audio, fonts, or other assets from third-party websites.
3. CORE GAME CONCEPT
PARADOX HEIST is a top-down action-puzzle game based on repeated 20-second time loops.
The player enters a secured time vault and must steal the Time Core before the loop expires.
During a loop, the player can:

Move.
Aim.
Shoot.
Dash.
Interact with switches.
Disable security systems.
Use an EMP device.
Carry or collect mission objects.
Evade enemies.
Reach the extraction portal.
When the timer reaches zero, or when the player manually resets the loop:

The current timeline ends.
The room resets to its initial state.
A new player timeline begins.
The previous player becomes an Echo.
Every previous Echo replays its recorded actions.
The current player can cooperate with all Echoes.
The player gradually creates a synchronized team made entirely of their previous timelines.
The emotional fantasy is:

I am planning and executing a perfect heist with an army of my past selves.


4. REQUIRED GAMEPLAY LOOP
The basic gameplay loop must be:

Observe the room.
Start the 20-second loop.
Perform one useful part of the plan.
Let the timeline reset.
Watch the previous timeline become an Echo.
Use that Echo to unlock a new opportunity.
Add more synchronized Echoes.
Complete the heist.
Receive a score and performance grade.
Replay for a cleaner solution.
A failed loop must still feel useful.
The game should never make the player feel that all progress was wasted merely because the timer expired.
Restarting a timeline must be extremely fast, preferably under one second without reloading the entire scene.


5. CONTROLS
Desktop controls:

WASD or arrow keys: Move
Mouse: Aim
Left mouse button: Shoot
Space: Dash
E: Interact
Q: EMP
R: Manually reset timeline
Escape: Pause
M: Mute
F: Optional fullscreen
Controls must feel responsive.
Include:

Input buffering for important actions.
A small amount of coyote tolerance for interactions where appropriate.
Clear cooldown indicators.
No unnecessary acceleration delay.
No slippery movement unless deliberately designed.
Support for remapping controls if practical.
Support for keyboard-only aiming as an accessibility fallback if practical.
Mobile controls are optional and must not delay completion of the polished desktop version.


6. ECHO RECORDING SYSTEM
This is the most important technical system.
Do not attempt to fully rewind all physics simulation.
Do not control Echo movement by replaying raw keyboard inputs through normal physics.
That approach can accumulate simulation errors and cause Echo paths to diverge.
Instead, record authoritative player timeline data at a stable fixed sampling rate.
Recommended structure:

interface EchoFrame {
  time: number;
  x: number;
  y: number;
  rotation: number;
  animationState: number;
  actionMask: number;
}
Possible action bitmask values:

enum EchoAction {
  None = 0,
  Shoot = 1 << 0,
  Interact = 1 << 1,
  Dash = 1 << 2,
  EMP = 1 << 3,
  Pickup = 1 << 4,
  Drop = 1 << 5
}
Requirements:
Record at 60 samples per second where practical.
A 20-second timeline should contain approximately 1,200 frames.
Use interpolation between recorded positions when necessary.
Echo movement must be kinematic and authoritative.
Echoes must not be pushed away from their recorded path by enemies or other Echoes.
Echoes should ignore collision responses that could alter playback.
Echoes may visually overlap each other.
Echoes can still trigger switches, shoot projectiles, use EMP, and contribute to objectives.
Echo actions should only affect the world when the relevant interaction conditions are valid.
Prevent duplicate action events caused by interpolation.
Keep playback deterministic and synchronized with the loop clock.
Reset all playback cursors correctly at the start of each loop.
Avoid storing unnecessary object references inside recording frames.
Provide unit tests for:

Correct number of recorded samples.
Correct action event playback.
Correct reset behavior.
Multiple Echo synchronization.
No duplicate shooting events.
No timeline data leaking between levels.
Limit active Echoes to a sensible number, such as six, unless performance testing proves more is safe.
Older Echoes may be visually simplified when necessary.


7. WORLD RESET RULES
At the beginning of every loop:
Reset:

Enemy positions.
Enemy health.
Laser states.
Doors.
Security cameras.
Projectiles.
EMP effects.
Destructible temporary objects.
Pickups.
Alarms.
Temporary visual effects.
Timeline timer.
Player position.
Echo playback positions.
Preserve:

Previously recorded Echo timelines.
Current level.
Loop count.
Player score metadata.
Accessibility settings.
Audio settings.
Permanent campaign progress.
Do not recreate the entire game application on every loop.
Reset or reuse existing level objects whenever practical.


8. LEVEL CONTENT
Create at least three polished campaign levels and one boss encounter.
Prefer three excellent levels over twenty unfinished levels.

Level 1 — First Echo
Purpose:

Teach movement.
Teach the loop timer.
Teach the Echo mechanic.
Introduce a pressure switch and a locked door.
Example solution:

First timeline holds the switch.
Second timeline walks through the opened door and takes the Time Core.
Keep tutorial text minimal and contextual.

Level 2 — Crossfire Protocol
Introduce:

Security drone.
Laser grid.
Shooting.
EMP.
Alarm state.
Example solution:

Echo 1 distracts the drone.
Echo 2 disables a laser control.
Current player takes the access key and reaches extraction.
Level 3 — Synchronized Heist
Introduce:

Multiple simultaneous switches.
Timed door.
Carryable object or energy cell.
More advanced routing.
Optional score challenge.
The level should require at least three coordinated timelines.

Boss — Chrono Warden
The boss guards the central Time Core.
Boss design:

Phase 1
Learn telegraphed projectile patterns.
Avoid attacks.
Damage shield nodes.
Phase 2
Four energy pylons must be activated or attacked within a small synchronization window.
One player cannot reach all pylons alone.
The player must create Echoes positioned at different pylons.
Phase 3
The boss disrupts the timeline.
It may temporarily hide an Echo, reverse a hazard pattern, or create time-distortion zones.
Avoid random mechanics that make recorded solutions unfair.
Keep all dangerous attacks clearly telegraphed.
Final sequence:

All Echoes perform their actions.
The pylons synchronize.
Time freezes briefly.
The boss core becomes exposed.
The player lands the final hit.
The room fractures into glowing time shards.
Display a powerful victory animation.
Show “PERFECT PARADOX” or another strong completion title when appropriate.
The victory sequence must be skippable after the first viewing.


9. SCORING SYSTEM
Score the player based on:

Number of timelines used.
Completion time.
Damage taken.
Detection count.
Accuracy.
Optional objectives.
Number of manual resets.
Successful synchronized Echo actions.
Whether the player achieved a perfect stealth or no-hit solution.
Provide a grade:

C
B
A
S
S+
PERFECT PARADOX
The result screen should show useful information and encourage replay.
Examples:

“Completed in 4 timelines.”
“2 fewer timelines needed for S rank.”
“No alarms triggered.”
“Three Echo actions synchronized within 0.2 seconds.”
Store best scores locally.


10. VISUAL DIRECTION
Use a premium cyberpunk time-vault visual identity.
Recommended art direction:

Dark navy or near-black environment.
Cyan or white player.
Semi-transparent cyan, violet, or spectral Echoes.
Red and orange enemies and hazards.
Gold Time Core and mission objects.
Clean geometric architecture.
Strong silhouettes.
Controlled neon glow.
High readability.
Limited but intentional color palette.
Avoid:

Excessive bloom.
Visual noise.
Tiny unreadable objects.
Continuous full-screen distortion.
Random particle spam.
Generic Bootstrap-style UI.
Default Phaser debug art.
Inconsistent asset styles.
Copyrighted franchise characters or logos.
The game should remain readable even during the final timeline with multiple Echoes.
Use layer separation:

Background.
Environment.
Interactable objects.
Characters.
Projectiles.
Important effects.
HUD.
Full-screen transitions.


11. ASSET CREATION AND SOURCING
You may:

Create original procedural assets.
Generate vector graphics.
Generate sprites programmatically.
Create SVG assets.
Create particle textures.
Create gradient maps.
Create simple original sprite sheets.
Use properly licensed third-party assets.
Use AI-generated assets when available and legally permitted.
Preferred approach:

Use original procedural and vector-based assets for consistency.
Use third-party assets mainly for audio, fonts, or small supporting effects.
Modify compatible assets to create a unified visual style.
If internet access is available, assets may be sourced from reputable libraries such as:

Kenney
OpenGameArt
Freesound
Pixabay
itch.io asset packs
Google Fonts
Other clearly licensed sources
Only use assets with licenses that permit use in this project.
Allowed examples:

CC0.
Public domain.
MIT.
Apache.
Commercial-use royalty-free licenses.
Attribution licenses when proper attribution is included.
Do not use:

Random images from Google Images.
Copyrighted game assets.
Assets extracted from commercial games.
Assets with unclear licensing.
Assets requiring payment unless already provided.
Hotlinked assets.
Temporary remote URLs.
AI-generated copies of famous characters or games.
For every external asset, create or update:

ASSET_CREDITS.md
Record:

Asset name.
Author.
Source page.
License.
Modifications made.
File path used in the project.
If browsing or downloading assets is unavailable:

Create original SVG, Canvas, or procedural placeholder assets.
Ensure they still look coherent and intentional.
Do not block development waiting for assets.
Do not leave ugly default placeholders in the final version.
Optimize all assets:

Use WebP or optimized PNG where appropriate.
Use spritesheets or texture atlases.
Remove unused frames.
Trim transparent borders.
Compress audio.
Avoid extremely large textures.
Do not load full-resolution artwork when a smaller size is sufficient.
Preload only assets required for the next scene.
Lazy-load later levels where practical.


12. CHARACTER ANIMATION
The player must have polished animations for:

Idle.
Movement.
Aim direction.
Shooting.
Dash anticipation.
Dash movement.
Dash recovery.
Interaction.
EMP activation.
Damage reaction.
Death or loop collapse.
Victory.
Echoes should reuse player animation data while adding:

Transparency.
Time trail.
Subtle frame echo.
Timeline identification marker.
Different intensity based on Echo age.
A brief spawn materialization effect.
A brief dissolve effect at timeline reset.
Animation requirements:

Smooth transitions.
No visible snapping between states.
Movement animation speed tied to actual velocity.
Aim direction should not break movement readability.
Dash must have clear anticipation and recovery.
Weapon recoil should be visible but controlled.
Important animation events should trigger sound and particles.
Avoid excessive skeletal complexity if it harms performance.
Use procedural animation where it looks better than low-quality sprite animation.
Possible procedural features:

Weapon recoil.
Character body lean.
Dash squash and stretch.
Hovering motion.
Echo trail.
Floating Time Core.
Door energy flow.
Camera tracking.
UI pulses.


13. GAME FEEL
Every important action must provide clear feedback.

Shooting
Include:

Small muzzle flash.
Recoil.
Projectile trail.
Hit spark.
Enemy flash.
Impact sound.
Very short hit-stop on significant hits.
Small camera impulse for powerful shots.
Dash
Include:

Anticipation frame.
Motion trail.
Directional streak.
Short invulnerability indicator.
Sharp sound.
Mild camera impulse.
Clear cooldown feedback.
EMP
Include:

Expanding ring.
Distortion limited to the effect area.
Enemy electric arcs.
Audio charge and release.
Brief environmental light response.
Clear disabled-state icon above enemies.
Timeline reset
This must be a signature animation.
Suggested sequence:

Timer reaches zero.
Audio briefly compresses.
Time freezes for approximately 100–150 milliseconds.
A radial time fracture appears.
Screen colors separate slightly.
The player silhouette stretches backward.
The scene rewinds through a short stylized transition.
The new timeline begins.
The previous player materializes as an Echo.
Keep the total reset transition fast enough that repeated loops remain enjoyable.

Major victory
Include:

Slow motion.
Time freeze.
Camera zoom.
Layered impact sound.
Strong but controlled screen shake.
Time shards.
Echo synchronization lines.
Victory typography.
Music resolution.
Provide a reduced-motion option.


14. CAMERA
Implement a smooth top-down camera with:

Soft follow.
Look-ahead toward the cursor.
Bounds limited to the level.
Small dynamic zoom during high-impact moments.
Controlled screen shake.
No constant camera wobble.
No motion sickness-inducing effects.
Screen shake must use trauma-based or similarly smooth decay rather than random uncontrolled movement.
Allow screen shake intensity to be reduced or disabled in settings.


15. AUDIO DIRECTION
Audio is essential.
Create or source:

Menu ambience.
Main gameplay music.
Final-loop music intensity layer.
Boss music.
Footsteps or movement texture.
Player weapon.
Enemy weapon.
Dash.
EMP.
Switch.
Door.
Laser.
Drone alert.
Pickup.
Timeline warning.
Timeline reset.
Victory.
UI hover and click.
Damage.
Boss phase transition.
Use layered adaptive music where possible.
Example:

Base layer during exploration.
Percussion layer during alarm.
High-intensity layer during the final five seconds.
Music briefly filters during time reset.
Boss layers change with phases.
Audio requirements:

No clipping.
Reasonable loudness.
Separate volume controls for music and sound effects.
Mute button.
Audio starts only after user interaction due to browser restrictions.
Avoid playing too many overlapping copies of the same sound.
Use audio pooling or concurrency limits.
Compress audio for web delivery.
Add attribution for sourced audio.


16. USER INTERFACE
Required screens:

Loading screen.
Main menu.
Level selection.
Settings.
Gameplay HUD.
Pause menu.
Result screen.
Credits.
Optional tutorial/help overlay.
Main menu should immediately communicate the concept.
Possible visual:

Player standing beside several transparent Echoes.
A looping 20-second timeline ring.
Animated Time Core in the background.
HUD must display:

Remaining loop time.
Current loop number.
Number of active Echoes.
Health.
Dash cooldown.
EMP cooldown or charges.
Current objective.
Alarm state.
Optional score multiplier.
The timeline must be visually prominent.
Recommended timeline UI:

Circular or horizontal timeline.
Markers showing important recorded actions.
Echo lanes or small colored indicators.
Strong warning during the final five seconds.
Do not cover important gameplay space.
The UI must scale correctly across common desktop resolutions.
Use responsive layout around a logical game resolution of:

1280 × 720


17. PERFORMANCE REQUIREMENTS
Target:

Stable 60 FPS on a typical mid-range desktop or laptop.
Graceful fallback on lower-end devices.
No severe frame spikes during timeline resets or boss victory.
Fast restart.
Reasonable initial download size.
No memory growth after repeated resets.
Use a single primary game canvas.
Do not create DOM elements for bullets, particles, enemies, Echoes, or other frequently updated gameplay objects.

Rendering
Prefer sprite batching.
Use texture atlases.
Minimize texture switching.
Avoid excessive masks.
Avoid multiple full-screen post-processing passes.
Avoid large real-time blur filters.
Avoid expensive dynamic shadows.
Cull off-screen objects.
Use simple collision shapes.
Reuse graphics objects where practical.
Cache static environment graphics.
Avoid redrawing static geometry every frame.
Memory
Use object pools for:

Player projectiles.
Enemy projectiles.
Hit particles.
Time shards.
Damage indicators.
Muzzle flashes.
EMP arcs.
Drone destruction effects.
Temporary UI indicators.
Avoid creating arrays, objects, closures, strings, or temporary vectors every frame.
Reuse temporary vectors and data buffers.
Ensure event listeners are removed when scenes shut down.
Ensure timers and tweens do not survive destroyed levels.

Simulation
Use a stable fixed-step simulation for timeline recording and important gameplay.
Clamp large delta-time spikes.
Pause correctly when the browser tab becomes hidden.
Do not allow returning to a hidden tab to simulate many seconds instantly.
Keep enemy AI lightweight.
Prefer finite state machines over complex behavior trees.
Use navigation nodes or simple steering instead of expensive continuous pathfinding.
Do not recalculate paths every frame.
Resolution
Use a logical resolution of 1280×720.
Scale to fit the viewport.
Cap device pixel ratio at a sensible value such as 1.5.
Add a low-quality render scale for weak devices.
Performance budgets
Use approximate budgets:

Normal gameplay particles: maximum around 150 active.
Major event particles: maximum around 400 active for short bursts.
Active projectiles: use explicit limits.
Active Echoes: approximately six by default.
Dynamic lights or glow emitters: tightly limited.
Full-screen effects: only during short transitions.
Add a small development-only performance overlay showing:

FPS.
Frame time.
Active objects.
Active projectiles.
Active particles.
Number of Echo frames.
Estimated timeline memory.
Draw calls if accessible.
Current quality preset.
Do not show the development overlay in normal release mode.


18. ADAPTIVE QUALITY SYSTEM
Implement quality presets:

Low
Reduced render scale.
Reduced particle count.
Simplified Echo trails.
No expensive distortion.
Reduced glow.
Reduced screen shake.
Fewer decorative animations.
No optional post-processing.
Medium
Balanced effects.
Moderate particles.
Standard trails.
Limited distortion.
Standard lighting.
High
Full effects.
More particles.
High-quality trails.
Controlled post-processing.
Enhanced victory effects.
Add an Auto option.
The Auto preset may sample frame time during gameplay and lower quality if sustained performance is poor.
Do not rapidly switch quality levels back and forth.
Save the selected quality to LocalStorage.


19. ACCESSIBILITY
Include:

Reduced motion.
Adjustable screen shake.
Music volume.
Sound volume.
Mute.
High-contrast interaction indicators.
Color choices that do not rely only on red versus green.
Pause at any time.
Clear control guide.
Optional aim assist.
Optional larger UI.
Optional timer warning sound.
Avoid flashing effects that could be uncomfortable.
Provide a way to reduce bright flashes.
Accessibility options must not break the visual style.


20. CODE ARCHITECTURE
Use a modular structure similar to:

src/
├── main.ts
├── config/
│   ├── gameConfig.ts
│   ├── balance.ts
│   ├── controls.ts
│   └── qualityPresets.ts
├── scenes/
│   ├── BootScene.ts
│   ├── PreloadScene.ts
│   ├── MenuScene.ts
│   ├── LevelSelectScene.ts
│   ├── GameScene.ts
│   ├── BossScene.ts
│   ├── ResultScene.ts
│   └── CreditsScene.ts
├── entities/
│   ├── Player.ts
│   ├── Echo.ts
│   ├── Drone.ts
│   ├── ChronoWarden.ts
│   ├── Projectile.ts
│   ├── Door.ts
│   ├── Switch.ts
│   ├── Laser.ts
│   └── TimeCore.ts
├── systems/
│   ├── InputSystem.ts
│   ├── InputRecorder.ts
│   ├── EchoPlaybackSystem.ts
│   ├── LoopManager.ts
│   ├── CombatSystem.ts
│   ├── InteractionSystem.ts
│   ├── EnemySystem.ts
│   ├── ScoreSystem.ts
│   ├── CameraSystem.ts
│   ├── EffectsSystem.ts
│   ├── AudioManager.ts
│   ├── QualityManager.ts
│   └── SaveManager.ts
├── ui/
│   ├── TimelineHUD.ts
│   ├── ObjectiveHUD.ts
│   ├── CooldownHUD.ts
│   ├── PauseMenu.ts
│   └── ResultPanel.ts
├── levels/
│   ├── level01.json
│   ├── level02.json
│   ├── level03.json
│   ├── boss.json
│   └── levelLoader.ts
├── pools/
│   ├── ProjectilePool.ts
│   ├── ParticlePool.ts
│   └── EffectPool.ts
├── types/
│   ├── echo.ts
│   ├── level.ts
│   └── gameplay.ts
└── utils/
    ├── math.ts
    ├── timing.ts
    ├── objectPool.ts
    └── performance.ts
Adjust this structure when necessary, but preserve separation of responsibilities.
Avoid:

One enormous GameScene file.
Global mutable state.
Circular imports.
Hardcoded values spread across many files.
Gameplay logic inside UI components.
Direct asset paths duplicated everywhere.
Scene-specific hacks that break other levels.
Place balance values in configuration files.


21. LEVEL DATA FORMAT
Define levels using structured data rather than hardcoding every object in scene code.
Example categories:

Player spawn.
Extraction point.
Walls.
Doors.
Switches.
Lasers.
Drones.
Security cameras.
Time Core.
Optional objectives.
Decorative objects.
Tutorial triggers.
Audio zones.
Validate level data on load.
If invalid data is found:

Show a useful development error.
Avoid crashing silently.
Fall back safely where possible.
Create a lightweight internal level-building method using JSON and helper functions.
A full visual editor is not required.


22. ENEMY DESIGN
Implement a security drone with simple, readable states:

Patrol.
Suspicious.
Alert.
Chase.
Attack.
Disabled.
Destroyed.
Return to patrol.
Requirements:

Clear visual state indicator.
Telegraph before firing.
Predictable enough for timeline planning.
Lightweight AI.
No unfair instant attacks.
No expensive pathfinding every frame.
Reset correctly each loop.
Audio cues for detection.
A visible line or cone indicating vision when useful.
Echoes may attract or distract drones.
Enemy behavior must remain deterministic enough for repeated timeline planning.
Avoid random decisions that invalidate previously recorded Echo plans.
Use seeded randomness when variation is necessary.


23. POLISH DETAILS
Add subtle environmental life:

Energy lines moving through walls.
Floating dust or time particles.
Pulsing door frames.
Security camera sweeps.
Time Core levitation.
Small machinery movement.
Background holograms.
Controlled ambient lighting changes.
Reflections represented through simple fake effects rather than expensive real reflections.
Add small narrative touches without long dialogue:

Vault warning messages.
Timeline instability messages.
Mission briefing cards.
Short level titles.
Optional hidden logs.
Environmental symbols.
Keep the story minimal and mysterious.


24. REQUIRED TESTING
Create automated tests for core logic.
At minimum test:

Echo recording length.
Echo playback timing.
Action bitmask correctness.
Loop reset.
Score calculation.
Level completion.
Save and load behavior.
Quality settings persistence.
Player input state.
Boss synchronization condition.
Object pool reuse.
Create browser smoke tests that verify:

Main menu loads.
The game can start.
Player can move.
Timeline timer decreases.
Reset creates an Echo.
Pause works.
Production build loads without console errors.
Manually inspect:

Repeated resets for memory leaks.
Ten or more consecutive timeline restarts.
Multiple Echoes.
Boss effects.
Window resizing.
Fullscreen.
Audio mute.
Reduced motion.
Low-quality mode.
Browser tab switching.
Slow devices using CPU throttling if available.
Do not ignore console warnings caused by the game.


25. DOCUMENTATION
Create a complete README containing:

Game title.
Short pitch.
Gameplay explanation.
Controls.
Main features.
Technology stack.
Installation.
Development commands.
Production build.
Deployment instructions.
Project structure.
Asset attribution link.
Performance decisions.
Known limitations.
Credits.
Also create:

ASSET_CREDITS.md
And, if helpful:

TECHNICAL_DESIGN.md
The technical design document should explain:

Echo recording.
Playback.
Loop resets.
Object pooling.
Quality presets.
Level format.
Performance strategy.


26. DEVELOPMENT PHASES
Phase 1 — Repository audit
Inspect the project.
Run the existing app.
Identify errors.
Create the architecture.
Confirm build commands.
Remove only clearly unused or broken code.
Establish linting and formatting.
Phase 2 — Core vertical slice
Implement:

One playable room.
Player movement.
Aim.
Shoot.
Dash.
Loop timer.
Recording.
One Echo.
One switch.
One door.
One objective.
Fast reset.
Basic HUD.
Do not continue until this loop is stable.

Phase 3 — Game systems
Implement:

Multiple Echoes.
Enemy drone.
EMP.
Lasers.
Scoring.
Sound.
Settings.
Save data.
Results.
Quality manager.
Object pooling.
Phase 4 — Content
Build:

Three campaign levels.
One boss encounter.
Level selection.
Progression.
Optional hidden objectives.
Phase 5 — Art and animation
Replace all crude placeholders.
Add:

Consistent original visual style.
Character animation.
Echo effects.
Environment animation.
UI animation.
Timeline reset animation.
Victory sequence.
Adaptive audio.
Phase 6 — Optimization
Profile:

CPU time.
GPU-heavy effects.
Memory.
Garbage collection.
Asset loading.
Draw calls.
Repeated timeline resets.
Boss victory.
Apply optimizations only after measuring likely bottlenecks.

Phase 7 — QA and competition polish
Fix all critical bugs.
Improve onboarding.
Verify controls.
Improve level readability.
Remove dead code.
Run tests.
Run production build.
Verify deployment.
Update documentation.
Ensure asset licensing is complete.


27. DEFINITION OF DONE
The project is not complete until all of the following are true:

The game loads without fatal errors.
The player can complete all campaign levels.
The player can defeat the boss.
Timeline reset works repeatedly.
Echoes remain synchronized.
Recorded actions do not duplicate.
The game feels responsive.
The main mechanic is taught without long instructions.
Art direction is consistent.
Placeholder assets are removed or intentionally stylized.
Sound effects are implemented.
Music is implemented.
Victory animation is polished.
Settings work.
Local progress saving works.
Low-quality mode works.
Reduced-motion mode works.
There are no severe memory leaks.
Performance remains stable after repeated loops.
Production build succeeds.
Tests pass.
README is complete.
External assets are attributed.
No unlicensed copyrighted assets are included.
The deployed version can be played immediately.


28. FINAL QUALITY STANDARD
The first 30 seconds should show:

A polished menu.
Strong visual identity.
Smooth movement.
Clear timer.
A visible Echo mechanic.
Immediate interaction.
Good sound feedback.
The first level should make the player think:

I understand this mechanic, and I want to see what happens when there are more Echoes.
The boss should make the judge think:

This mechanic is not only a gimmick. The entire encounter was designed around it.
Do not prioritize raw feature count.
Prioritize:

Clarity.
Responsiveness.
Synchronization.
Readability.
Performance.
Spectacle at the right moments.
A cohesive experience.
Begin by auditing the current repository, creating the implementation plan, and then building the Phase 2 vertical slice.
Continue working through the phases until the complete competition-ready version is implemented, tested, optimized, documented, and ready to deploy.


đọc kỹ prompt này, bây giờ tao sẽ dùng 2 AI để làm game này, tao sẽ dùng đầu tiên là claude AI, tiếp theo là codex, cả 2 đều dùng bản trả phí, cho tao plan để phối hợp 2 AI này, anh mentor gợi ý sẽ tạo file md và file chang log gì đó, để khi AI này gần hết quota qua AI khác sẽ chỉ cần đọc 2 file đó, không cần đọc toàn bộ dự án nữa, tao cũng định tái xử dụng prompt này tao phải làm như nào bro