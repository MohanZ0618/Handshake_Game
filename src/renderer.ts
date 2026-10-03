import type { WeaponModels } from "./weapon-models";
import { WEAPON_IDS } from "../shared/weapons";
import * as THREE from "three";
import {
  TEAMS,
  POWER_INFO,
  type Snapshot,
  type Player,
  type Input,
  type GameEvent,
} from "../shared/game";
import {
  WIDTH,
  DEPTH,
  rampHeight,
  type Vec3,
  type Arena,
} from "../shared/arena";
import { EYE_HEIGHT, rayWorld, direction } from "../shared/physics";
import { Prediction, Interpolation, constrainCamera } from "./prediction";
import { FrameMetrics, NetworkMetrics } from "./metrics";

type Particle = {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
};
export class ArenaRenderer {
  readonly metrics = new FrameMetrics();
  readonly network = new NetworkMetrics();
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(78, 1, 0.5, 4500);
  private weaponScene = new THREE.Scene();
  private weaponCamera = new THREE.PerspectiveCamera(78, 1, 0.1, 200);
  private prediction: Prediction;
  private interpolation = new Interpolation();
  private lastMini = 0;
  private quality?: "low" | "high";
  private v0 = new THREE.Vector3();
  private v1 = new THREE.Vector3();
  private forward = new THREE.Vector3(0, 0, 1);
  private particlePool: Particle[] = [];
  private laserMaterial = new THREE.MeshBasicMaterial({
    color: "#c986ff",
    transparent: true,
    opacity: 0.8,
  });
  private bulletPool: THREE.Mesh[] = [];
  private beamPool: THREE.Mesh[] = [];
  private renderer: THREE.WebGLRenderer;
  private world = new THREE.Group();
  private unit = new THREE.BoxGeometry(1, 1, 1);
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private players = new Map<string, THREE.Group>();
  private pickups = new Map<number, THREE.Group>();
  private bullets = new Map<number, THREE.Mesh>();
  private beams = new Map<number, THREE.Mesh>();
  private particles: Particle[] = [];
  private flashes = new Map<string, number>();
  private hitFlashes = new Map<string, number>();
  private weapon = new THREE.Group();
  private muzzle: THREE.Mesh;
  private laserGlow: THREE.Mesh;
  private state?: Snapshot;
  private base?: Player;
  private receivedAt = 0;
  private recoil = 0;
  private damage = 0;
  private frameTimes: number[] = [];
  private lastMeasuredFrame = 0;
  private arenaId = "";
  private phase = "";
  private size = { w: 0, h: 0 };
  private mini: CanvasRenderingContext2D;
  private miniCanvas: HTMLCanvasElement;
  constructor(
    private canvas: HTMLCanvasElement,
    minimap: HTMLCanvasElement,
    private myId: string,
    private arena: Arena,
    private models: WeaponModels,
    quality: "low" | "high" = "low",
  ) {
    this.prediction = new Prediction(arena);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.autoClear = false;
    this.setQuality(quality);
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color("#122232");
    this.scene.fog = new THREE.Fog("#122232", 1100, 3500);
    this.scene.add(this.world);
    this.scene.add(new THREE.HemisphereLight("#c5e8ff", "#253241", 2.2));
    const sun = new THREE.DirectionalLight("#fff0db", 2.5);
    sun.position.set(800, 1600, 400);
    sun.target.position.set(1200, 0, 800);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -1600,
      right: 1600,
      top: 1600,
      bottom: -1600,
      near: 100,
      far: 3500,
    });
    sun.shadow.bias = -0.0003;
    this.scene.add(sun, sun.target);
    this.scene.add(this.camera);
    this.weaponScene.add(this.weapon);
    this.weaponScene.add(new THREE.HemisphereLight("#d7efff", "#233144", 2.5));
    const weaponLight = new THREE.DirectionalLight("#fff0df", 3);
    weaponLight.position.set(-20, 40, 30);
    this.weaponScene.add(weaponLight);
    this.weapon.position.set(14, -13, -28);
    this.weapon.rotation.set(0, 0, 0);
    for (const id of WEAPON_IDS) {
      const model = this.models[id].clone(true);
      model.name = id;
      this.weapon.add(model);
    }
    this.muzzle = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3, 0),
      new THREE.MeshBasicMaterial({ color: "#ffe8ad" }),
    );
    this.muzzle.position.set(0, 1, -24);
    this.weapon.add(this.muzzle);
    this.muzzle.visible = false;
    this.laserGlow = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.6, 6, 12),
      new THREE.MeshBasicMaterial({
        color: "#d19aff",
        transparent: true,
        opacity: 0.7,
      }),
    );
    this.weapon.add(this.laserGlow);
    this.miniCanvas = minimap;
    this.mini = minimap.getContext("2d")!;
    canvas.addEventListener("webglcontextlost", this.contextLost);
  }
  private contextLost = (e: Event) => {
    e.preventDefault();
    this.canvas.dispatchEvent(
      new CustomEvent("rendererror", {
        detail:
          "Graphics context lost. Leave and rejoin the room to restore the arena.",
      }),
    );
  };
  private material(color: string) {
    let m = this.materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.15,
      });
      this.materials.set(color, m);
    }
    return m;
  }
  private box(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) {
    const mesh = new THREE.Mesh(this.unit, this.material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = parent === this.world;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private label(text: string, color: string, width = 180) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#071421dd";
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = color;
    ctx.font = "bold 40px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 62);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
      }),
    );
    sprite.scale.set(width, (width * 96) / 512, 1);
    return sprite;
  }
  private build() {
    this.arenaId = this.arena.id;
    this.box(this.world, WIDTH / 2, -6, DEPTH / 2, WIDTH, 12, DEPTH, "#253748");
    const grid: number[] = [];
    for (let x = 0; x <= WIDTH; x += 100) grid.push(x, 0.15, 0, x, 0.15, DEPTH);
    for (let z = 0; z <= DEPTH; z += 100) grid.push(0, 0.15, z, WIDTH, 0.15, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(grid, 3));
    this.world.add(
      new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color: "#486074",
          transparent: true,
          opacity: 0.35,
        }),
      ),
    );
    for (const b of this.arena.boxes) {
      const color =
        b.kind === "floor"
          ? "#526d83"
          : b.kind === "rail"
            ? "#667f91"
            : b.kind === "boundary"
              ? "#263d51"
              : b.h < 40
                ? "#b38b54"
                : "#48617a";
      this.box(
        this.world,
        b.x + b.w / 2,
        b.y + b.h / 2,
        b.z + b.d / 2,
        b.w,
        b.h,
        b.d,
        color,
      );
      if (b.kind === "cover") {
        this.box(
          this.world,
          b.x + b.w / 2,
          b.y + b.h - 3,
          b.z - 0.2,
          b.w - 8,
          3,
          1,
          b.y > 0 ? "#70dcec" : "#d7b579",
        );
      }
      if (b.kind === "floor")
        this.box(
          this.world,
          b.x + b.w / 2,
          b.y + 2,
          b.z + b.d / 2,
          b.w + 0.5,
          3,
          b.d + 0.5,
          "#51aaba",
        );
    }
    for (const r of this.arena.ramps) {
      const corners = [
        [r.x, r.z],
        [r.x + r.w, r.z],
        [r.x + r.w, r.z + r.d],
        [r.x, r.z + r.d],
      ];
      const v: number[] = [];
      for (const [x, z] of corners) v.push(x, rampHeight(r, x, z)!, z);
      for (const [x, z] of corners) v.push(x, 0, z);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      g.setIndex([
        0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6,
        3, 0, 4, 3, 4, 7,
      ]);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, this.material("#687e90"));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.world.add(mesh);
      for (let t = 0.15; t < 1; t += 0.17) {
        const x = r.x + (r.axis === "x" ? t * r.w : r.w / 2),
          z = r.z + (r.axis === "z" ? t * r.d : r.d / 2),
          y = rampHeight(r, x, z)!;
        const strip = this.box(
          this.world,
          x,
          y + 0.5,
          z,
          r.axis === "x" ? 3 : r.w - 10,
          1,
          r.axis === "z" ? 3 : r.d - 10,
          "#a8dce4",
        );
        strip.rotation[r.axis === "x" ? "z" : "x"] =
          (r.reverse ? -1 : 1) *
          Math.atan(r.height / (r.axis === "x" ? r.w : -r.d));
      }
    }
    this.arena.spawns.forEach((p, i) => {
      const pad = this.box(
        this.world,
        p.x,
        0.3,
        p.z,
        150,
        0.6,
        130,
        TEAMS[i].color,
      );
      pad.castShadow = false;
      const sign = this.label(
        `${TEAMS[i].name} / ${i + 1}`,
        TEAMS[i].color,
        190,
      );
      sign.position.set(p.x, 110, p.z);
      this.world.add(sign);
    });
    const sign = this.label("SKYBRIDGE  /  SECTOR 02", "#8be6ff", 340);
    sign.position.set(1200, 255, 800);
    this.world.add(sign);
  }
  setQuality(quality: "low" | "high") {
    if (this.quality === quality) return;
    this.quality = quality;
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, quality === "low" ? 1 : 1.5),
    );
    this.renderer.shadowMap.enabled = quality === "high";
    this.renderer.shadowMap.needsUpdate = true;
  }
  accept(s: Snapshot) {
    if (!this.arenaId) {
      this.build();
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (this.phase !== `${s.round}/${s.phase}`) {
      this.clearEffects();
      this.interpolation.clear();
      this.phase = `${s.round}/${s.phase}`;
    }
    this.state = s;
    this.receivedAt = performance.now();
    this.interpolation.push(s);
    const me = s.players.find((p) => p.id === this.myId);
    if (me) {
      this.prediction.accept(me, s);
      this.base = this.prediction.body;
      this.network.record(this.receivedAt, this.prediction.correction);
    }
  }
  event(e: GameEvent) {
    if (e.kind === "shot" || e.kind === "laser") {
      this.flashes.set(e.actor, performance.now() + 75);
      if (e.actor === this.myId) this.recoil = 1;
      else this.burst(e, 3, "#ffeab2", 0.08);
    }
    if (e.kind === "hit") {
      this.hitFlashes.set(e.actor, performance.now() + 100);
      if (e.actor === this.myId) this.damage = 1;
      this.burst(e, 4, TEAMS[e.team].color, 0.2);
    }
    if (e.kind === "kill") this.burst(e, 16, TEAMS[e.team].color, 0.7);
    if (e.kind === "dash") this.burst(e, 9, "#a5edff", 0.32);
    if (e.kind === "pickup" || e.kind === "use")
      this.burst(e, 7, e.power ? POWER_INFO[e.power].color : "#ffffff", 0.5);
  }
  private burst(p: Vec3, n: number, color: string, life: number) {
    for (let i = 0; i < n && this.particles.length < 160; i++) {
      const particle = this.particlePool.pop() ?? {
        mesh: this.box(this.scene, p.x, p.y - 15, p.z, 4, 4, 4, color),
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
      };
      particle.mesh.material = this.material(color);
      particle.mesh.position.set(p.x, p.y - 15, p.z);
      particle.mesh.visible = true;
      particle.mesh.castShadow = false;
      particle.vx = (Math.random() - 0.5) * 150;
      particle.vy = Math.random() * 120;
      particle.vz = (Math.random() - 0.5) * 150;
      particle.life = life;
      this.particles.push(particle);
    }
  }
  private clearEffects() {
    for (const p of this.particles) {
      p.mesh.visible = false;
      this.particlePool.push(p);
    }
    this.particles = [];
    for (const m of this.bullets.values()) {
      m.visible = false;
      this.bulletPool.push(m);
    }
    for (const m of this.beams.values()) {
      m.visible = false;
      this.beamPool.push(m);
    }
    this.bullets.clear();
    this.beams.clear();
    this.flashes.clear();
    this.hitFlashes.clear();
    this.recoil = 0;
    this.damage = 0;
  }
  frame(
    dt: number,
    input: Input,
    shake: boolean,
    motionMs = dt * 1000,
  ): Player | undefined {
    const s = this.state;
    if (!s || !this.base) return;
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    if (rect.width !== this.size.w || rect.height !== this.size.h) {
      this.size = { w: rect.width, h: rect.height };
      this.renderer.setSize(rect.width, rect.height, false);
      this.camera.aspect = rect.width / Math.max(1, rect.height);
      this.camera.updateProjectionMatrix();
      this.weaponCamera.aspect = this.camera.aspect;
      this.weaponCamera.updateProjectionMatrix();
    }
    const elapsed = Math.min(200, performance.now() - this.receivedAt),
      now = s.now + elapsed;
    this.prediction.step(
      input,
      motionMs,
      s.phase === "playing" && performance.now() - this.receivedAt < 300,
    );
    const me = this.prediction.body!;
    const display = this.prediction.display();
    const targetEye = {
      x: display.x,
      y: display.y + (me.hp > 0 ? EYE_HEIGHT : 28),
      z: display.z,
    };
    const eye = { x: me.x, y: me.y + (me.hp > 0 ? EYE_HEIGHT : 28), z: me.z };
    let safe = constrainCamera(this.arena, eye, targetEye);
    if (
      this.camera.position.distanceTo(this.v0.set(safe.x, safe.y, safe.z)) < 24
    )
      safe = constrainCamera(this.arena, this.camera.position, safe);
    this.camera.position.set(safe.x, safe.y, safe.z);
    this.v0.set(
      Math.cos(input.aim) * Math.cos(input.pitch),
      Math.sin(input.pitch),
      Math.sin(input.aim) * Math.cos(input.pitch),
    );
    this.v0.add(this.camera.position);
    this.camera.lookAt(this.v0);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.damage = Math.max(0, this.damage - dt * 3);
    if (shake) {
      this.camera.rotateZ(
        Math.sin(performance.now() * 0.06) * this.damage * 0.01,
      );
      this.camera.rotateX(this.recoil * 0.012);
    }
    this.weapon.visible = me.hp > 0 && s.phase === "playing";
    for (const id of WEAPON_IDS)
      this.weapon.getObjectByName(id)!.visible = id === me.weapon;
    this.muzzle.position.z =
      me.weapon === "smg" ? -18 : me.weapon === "shotgun" ? -20 : -24;
    this.laserGlow.position.copy(this.muzzle.position);
    this.laserGlow.visible = me.power === "laser" && me.powerUntil > now;
    const wall = rayWorld(
      this.arena,
      eye,
      direction(input.aim, input.pitch),
      70,
    );
    const retract = wall ? (1 - wall.distance / 70) * 18 : 0;
    this.weapon.position.z = -28 + this.recoil * 2 + retract;
    this.weapon.position.y =
      -13 -
      (me.reloadUntil > now
        ? Math.sin((me.reloadUntil - now) / 200) * 3 + 5
        : 0);
    this.weapon.rotation.z = me.reloadUntil > now ? -0.25 : 0;
    this.weapon.position.y -= me.switchUntil > now ? 8 : 0;
    (this.muzzle.material as THREE.MeshBasicMaterial).color.set(
      me.power === "laser" ? "#cc88ff" : "#ffe8ad",
    );
    this.muzzle.visible =
      (this.flashes.get(this.myId) ?? 0) > performance.now();
    for (const authoritative of s.players) {
      if (authoritative.id === this.myId) continue;
      const p =
        this.interpolation.sample(authoritative.id, now) ?? authoritative;
      let group = this.players.get(p.id);
      if (!group) {
        group = new THREE.Group();
        this.box(group, 0, 29, 0, 27, 34, 24, TEAMS[p.team].color);
        this.box(group, 0, 53, 0, 25, 17, 25, "#263748");
        this.box(group, 13, 55, 0, 2, 7, 21, TEAMS[p.team].color);
        this.box(group, -6, 8, -8, 10, 16, 10, "#1a2736");
        this.box(group, -6, 8, 8, 10, 16, 10, "#1a2736");
        const gun = new THREE.Group();
        gun.name = "gun";
        gun.position.set(0, 43, 0);
        for (const id of WEAPON_IDS) {
          const model = this.models[id].clone(true);
          model.name = id;
          model.rotation.y = -Math.PI / 2;
          model.position.x = 22;
          gun.add(model);
        }
        group.add(gun);
        const label = this.label(
          p.bot ? "ROBOT" : p.name,
          p.bot ? "#c5d1dc" : TEAMS[p.team].color,
          65,
        );
        label.position.y = 80;
        group.add(label);
        const shield = new THREE.Mesh(
          new THREE.SphereGeometry(40, 12, 8),
          new THREE.MeshBasicMaterial({
            color: TEAMS[p.team].color,
            wireframe: true,
            transparent: true,
            opacity: 0.3,
          }),
        );
        shield.name = "shield";
        shield.position.y = 30;
        group.add(shield);
        group.position.set(p.x, p.y, p.z);
        this.players.set(p.id, group);
        this.scene.add(group);
      }
      group.visible = p.hp > 0;
      group.position.set(p.x, p.y, p.z);
      group.rotation.y = -p.aim;
      const gun = group.getObjectByName("gun")!;
      gun.rotation.z = p.pitch;
      for (const id of WEAPON_IDS)
        gun.getObjectByName(id)!.visible = id === p.weapon;
      group.getObjectByName("shield")!.visible =
        p.shieldUntil > now || (p.power === "shield" && p.powerUntil > now);
      group.scale.setScalar(
        (this.hitFlashes.get(p.id) ?? 0) > performance.now() ? 1.08 : 1,
      );
    }
    for (const [id, obj] of this.players)
      if (!s.players.some((p) => p.id === id)) {
        this.releaseObject(obj);
        this.players.delete(id);
      }
    for (const p of s.pickups) {
      let g = this.pickups.get(p.id);
      if (!g) {
        g = new THREE.Group();
        const cube = this.box(
          g,
          0,
          26,
          0,
          24,
          24,
          24,
          POWER_INFO[p.kind].color,
        );
        cube.name = "cube";
        const label = this.label(
          POWER_INFO[p.kind].icon,
          POWER_INFO[p.kind].color,
          65,
        );
        label.name = "label";
        label.position.y = 62;
        g.add(label);
        g.userData.kind = p.kind;
        this.scene.add(g);
        this.pickups.set(p.id, g);
      }
      if (g.userData.kind !== p.kind) {
        (g.getObjectByName("cube") as THREE.Mesh).material = this.material(
          POWER_INFO[p.kind].color,
        );
        this.releaseObject(g.getObjectByName("label")!);
        const label = this.label(
          POWER_INFO[p.kind].icon,
          POWER_INFO[p.kind].color,
          65,
        );
        label.name = "label";
        label.position.y = 62;
        g.add(label);
        g.userData.kind = p.kind;
      }
      g.visible = p.readyAt === 0;
      g.position.set(
        p.x,
        p.y + Math.sin(performance.now() / 400 + p.id) * 4,
        p.z,
      );
      g.getObjectByName("cube")!.rotation.set(
        0.3,
        performance.now() / 1000,
        0.3,
      );
    }
    this.camera.updateMatrixWorld();
    this.weapon.updateMatrixWorld();
    this.syncProjectiles(now);
    for (const p of this.particles) {
      p.life -= dt;
      p.vy -= 250 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 4;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.particlePool.push(p);
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.weaponScene, this.weaponCamera);
    if (performance.now() - this.lastMini > 100) {
      this.drawMinimap(me, input.aim);
      this.lastMini = performance.now();
    }
    const measuredAt = performance.now();
    this.metrics.record(measuredAt, !document.hidden);
    if (this.lastMeasuredFrame && !document.hidden)
      this.frameTimes.push((measuredAt - this.lastMeasuredFrame) / 1000);
    this.lastMeasuredFrame = measuredAt;
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    return me;
  }
  private syncProjectiles(now: number) {
    const s = this.state!;
    for (const b of s.bullets) {
      let mesh = this.bullets.get(b.id);
      if (!mesh) {
        mesh =
          this.bulletPool.pop() ??
          this.box(this.scene, b.x, b.y, b.z, 3, 3, 10, "#ffe8aa");
        mesh.visible = true;
        mesh.castShadow = false;
        this.bullets.set(b.id, mesh);
      }
      const ahead = Math.min(50, Math.max(0, now - s.now)) / 1000;
      mesh.position.set(
        b.x + b.vx * ahead,
        b.y + b.vy * ahead,
        b.z + b.vz * ahead,
      );
      mesh.quaternion.setFromUnitVectors(
        this.forward,
        this.v0.set(b.vx, b.vy, b.vz).normalize(),
      );
    }
    for (const [id, m] of this.bullets)
      if (!s.bullets.some((b) => b.id === id)) {
        m.visible = false;
        this.bulletPool.push(m);
        this.bullets.delete(id);
      }
    for (const b of s.beams) {
      if (b.until <= now) continue;
      let mesh = this.beams.get(b.id);
      if (!mesh) {
        mesh =
          this.beamPool.pop() ?? new THREE.Mesh(this.unit, this.laserMaterial);
        if (!mesh.parent) this.scene.add(mesh);
        mesh.visible = true;
        this.beams.set(b.id, mesh);
        this.burst(b.end, 3, "#cf9aff", 0.18);
      }
      this.v0.set(b.start.x, b.start.y, b.start.z);
      if (b.owner === this.myId && b.segment === 0) {
        this.muzzle
          .getWorldPosition(this.v0)
          .applyMatrix4(this.camera.matrixWorld);
        const p = this.prediction.body!;
        const eye = { x: p.x, y: p.y + EYE_HEIGHT, z: p.z };
        const safe = constrainCamera(this.arena, eye, this.v0);
        this.v0.set(safe.x, safe.y, safe.z);
      }
      this.v1.set(b.end.x, b.end.y, b.end.z).sub(this.v0);
      const length = this.v1.length();
      mesh.position.copy(this.v0).addScaledVector(this.v1, 0.5);
      mesh.scale.set(3, 3, length);
      mesh.quaternion.setFromUnitVectors(this.forward, this.v1.normalize());
    }

    for (const [id, m] of this.beams)
      if (!s.beams.some((b) => b.id === id && b.until > now)) {
        m.visible = false;
        this.beamPool.push(m);
        this.beams.delete(id);
      }
  }
  private drawMinimap(me: Player, aim: number) {
    const c = this.mini,
      s = this.state!,
      w = this.miniCanvas.width,
      h = this.miniCanvas.height,
      scale = w / WIDTH;
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#0c1a28ee";
    c.fillRect(0, 0, w, h);
    for (const b of this.arena.boxes) {
      c.fillStyle = b.kind === "floor" ? "#426174" : "#7a91a1";
      c.globalAlpha = b.y >= 124 === me.y > 90 ? 0.8 : 0.3;
      c.fillRect(b.x * scale, b.z * scale, b.w * scale, b.d * scale);
    }
    c.globalAlpha = 1;
    c.fillStyle = "#88bfc2";
    for (const r of this.arena.ramps)
      c.fillRect(r.x * scale, r.z * scale, r.w * scale, r.d * scale);
    for (const p of s.pickups)
      if (!p.readyAt) {
        c.fillStyle = POWER_INFO[p.kind].color;
        c.fillRect(p.x * scale - 2, p.z * scale - 2, 4, 4);
      }
    for (const p of s.players)
      if (p.hp > 0) {
        c.globalAlpha = p.y > 90 === me.y > 90 ? 1 : 0.35;
        c.fillStyle = p.id === this.myId ? "#ffffff" : TEAMS[p.team].color;
        c.beginPath();
        c.arc(
          p.x * scale,
          p.z * scale,
          p.id === this.myId ? 3.5 : 2.5,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    c.globalAlpha = 1;
    c.strokeStyle = "#fff";
    c.beginPath();
    c.moveTo(me.x * scale, me.z * scale);
    c.lineTo(
      me.x * scale + Math.cos(aim) * 12,
      me.z * scale + Math.sin(aim) * 12,
    );
    c.stroke();
    c.fillStyle = "#d6ecf4";
    c.font = "10px Segoe UI";
    c.fillText(me.y > 90 ? "L2 / SKYBRIDGE" : "L1 / GROUND", 8, h - 8);
  }
  fps() {
    if (!this.frameTimes.length) return 0;
    return Math.round(
      this.frameTimes.length / this.frameTimes.reduce((a, b) => a + b, 0),
    );
  }
  resources() {
    return `GPU geometries ${this.renderer.info.memory.geometries}; textures ${this.renderer.info.memory.textures}; draw calls ${this.renderer.info.render.calls}`;
  }
  private releaseObject(obj: THREE.Object3D) {
    obj.parent?.remove(obj);
    obj.traverse((o) => {
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      } else if (o instanceof THREE.Mesh) {
        if (o.userData.weaponAsset) return;
        if (o.geometry !== this.unit) o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (![...this.materials.values()].includes(m)) m.dispose();
      }
    });
  }
  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    const all = new THREE.Group();
    all.add(this.scene, this.weaponScene);
    all.traverse((o) => {
      if (
        o instanceof THREE.Mesh ||
        o instanceof THREE.LineSegments ||
        o instanceof THREE.Sprite
      ) {
        if ("geometry" in o) geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          materials.add(m);
          if ("map" in m) (m.map as THREE.Texture | null)?.dispose();
        }
      }
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.laserMaterial.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.scene.clear();
    this.weaponScene.clear();
  }
}
