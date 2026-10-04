import { weaponViewPose, WEAPON_PRESENTATION, type WeaponModels } from "./weapon-models";
import { WEAPON_IDS } from "../shared/weapons";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createCharacterRig, updateCharacterRig, type CharacterRig } from "./character-rig";
import { Sky } from "three/addons/objects/Sky.js";
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
import { SHOP } from "../shared/career";

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
    color: "#f1b986",
    transparent: true,
    opacity: 0.55,
  });
  private sniperBeamMaterial = new THREE.MeshBasicMaterial({ color: "#f3e2bf", transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
  private skinTime = { value: 0 };
  private adsRaise = 0;
  private sniperMesh?: THREE.Group;
  private lightning: { mesh: THREE.LineSegments; until: number }[] = [];
  private bulletPool: THREE.Mesh[] = [];
  private beamPool: THREE.Mesh[] = [];
  private renderer: THREE.WebGLRenderer;
  private environment: THREE.WebGLRenderTarget;
  private world = new THREE.Group();
  private unit = new THREE.BoxGeometry(1, 1, 1);
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private players = new Map<string, THREE.Group>();
  private playerRigs = new Map<string, CharacterRig>();
  private pickups = new Map<number, THREE.Group>();
  private batteryMeshes = new Map<number, THREE.Group>();
  private bullets = new Map<number, THREE.Mesh>();
  private beams = new Map<number, THREE.Mesh>();
  private particles: Particle[] = [];
  private decals: { mesh: THREE.Mesh; until: number }[] = [];
  private decalGeometry = new THREE.PlaneGeometry(11, 11);
  private decalTexture?: THREE.CanvasTexture;
  private surfaceMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private flashes = new Map<string, number>();
  private hitFlashes = new Map<string, number>();
  private weapon = new THREE.Group();
  private muzzle: THREE.Mesh;
  private laserGlow: THREE.Mesh;
  private state?: Snapshot;
  private base?: Player;
  private currentSkin: string | null | undefined;
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
    quality: "low" | "high" = "high",
  ) {
    this.prediction = new Prediction(arena);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.autoClear = false;
    this.setQuality(quality);
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const studio = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(studio, .04);
    studio.dispose();
    pmrem.dispose();
    this.scene.environment = this.weaponScene.environment = this.environment.texture;
    this.scene.environmentIntensity = .35;
    this.weaponScene.environmentIntensity = .9;
    this.scene.background = new THREE.Color("#b8d3df");
    this.scene.fog = new THREE.Fog("#c9d3d2", 1800, 4400);
    const sky = new Sky();
    sky.scale.setScalar(10000);
    sky.material.uniforms.turbidity.value = 4;
    sky.material.uniforms.rayleigh.value = 1.6;
    sky.material.uniforms.sunPosition.value.set(.5, .75, -.3);
    this.scene.add(sky);
    this.scene.add(this.world);
    this.scene.add(new THREE.HemisphereLight("#d9e9f3", "#655746", .9));
    const sun = new THREE.DirectionalLight("#fff0d5", 3);
    sun.position.set(800, 1600, 400);
    sun.target.position.set(1200, 0, 800);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
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
    this.weaponScene.add(new THREE.HemisphereLight("#e9f1f4", "#50483e", .9));
    const weaponLight = new THREE.DirectionalLight("#fff2dd", 2.2);
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
  private surface(kind: "concrete" | "steel" | "floor") {
    let material = this.surfaceMaterials.get(kind);
    if (material) return material;
    if (kind !== "steel") {
      const asset = kind === "floor" ? "concrete_floor_02" : "plaster_grey_04";
      const loader = new THREE.TextureLoader();
      const load = (map: string, color = false) => {
        const texture = loader.load(`/assets/surfaces/${asset}-${map}.jpg`);
        texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(kind === "floor" ? 12 : 3, kind === "floor" ? 8 : 3);
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        return texture;
      };
      material = new THREE.MeshStandardMaterial({
        map: load("color", true), normalMap: load("normal"),
        roughnessMap: load("roughness"), roughness: .95, metalness: 0,
        normalScale: new THREE.Vector2(.55, .55),
      });
      this.surfaceMaterials.set(kind, material);
      return material;
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#636967";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1100; i++) {
      const tone = Math.round(45 + Math.random() * 130);
      ctx.fillStyle = `rgba(${tone},${tone},${tone},0.12)`;
      ctx.fillRect(
        Math.random() * 256,
        Math.random() * 256,
        1 + Math.random() * 4,
        1 + Math.random() * 2,
      );
    }
    ctx.strokeStyle = "#343b3b88";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const y = Math.random() * 256;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 120, y);
      ctx.lineTo(140 + Math.random() * 116, y + Math.random() * 12);
      ctx.stroke();
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(4, 4);
    material = new THREE.MeshStandardMaterial({
      map,
      roughness: .56,
      metalness: .65,
      bumpMap: map,
      bumpScale: .15,
    });
    this.surfaceMaterials.set(kind, material);
    return material;
  }
  private styleModel(model: THREE.Object3D, skin: string | null) {
    const item = SHOP.find(
      (entry) => entry.id === skin && entry.type === "skin",
    );
    if (!item) return;
    const palettes: Record<string, [string, string]> = {
      "skin-cinder": ["#ffda00", "#64091e"],
      "skin-cinder-graphite": ["#b900ff", "#40ffce"],
      "skin-cinder-teal": ["#ff168f", "#08213c"],
      "skin-oxide": ["#ff6b00", "#051133"],
      "skin-sand": ["#0064ff", "#29142f"],
    };
    const [second, third] = palettes[item.id] ?? ["#66cfff", "#d579ff"];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData.skinProtected) return;
      const tint = (source: THREE.Material) => {
        const material = source.clone();
        if (material instanceof THREE.MeshStandardMaterial) {
          const accent = Boolean(object.userData.skinAccent);
          material.color.set("#ffffff");
          material.metalness = .72;
          material.roughness = .2;
          if (material instanceof THREE.MeshPhysicalMaterial) {
            material.clearcoat = 1;
            material.clearcoatRoughness = .09;
            material.iridescence = .28;
            material.iridescenceIOR = 1.35;
          }
          material.emissive.set(item.color);
          material.emissiveIntensity = .06;
          material.userData.ownedSkin = true;
          material.customProgramCacheKey = () => `${item.id}-${accent ? "accent" : "shell"}`;
          material.onBeforeCompile = (shader) => {
            shader.uniforms.uSkinTime = this.skinTime;
            const color = (hex: string) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; };
            shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSkinPos;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSkinPos = position;");
            shader.fragmentShader = shader.fragmentShader
              .replace("#include <common>", "#include <common>\nvarying vec3 vSkinPos;\nuniform float uSkinTime;")
              .replace("#include <color_fragment>", `#include <color_fragment>
                float stripe = smoothstep(-.12, .12, sin(vSkinPos.z * .46 + vSkinPos.y * .65));
                float detail = smoothstep(.72, .9, sin(vSkinPos.z * .19 - vSkinPos.x * .8));
                vec3 lacquer = mix(${color(item.color)}, ${color(second)}, stripe);
                diffuseColor.rgb = mix(lacquer, ${color(third)}, detail * .26);`)
              .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
                float fleck = pow(max(0., sin(vSkinPos.x * 32.) * sin(vSkinPos.z * 27.)), 24.);
                float sweep = pow(max(0., sin(vSkinPos.z * .45 - uSkinTime * 1.4)), 18.);
                totalEmissiveRadiance += vec3(1., .92, .75) * fleck * sweep * .8;`);
          };
        }
        return material;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(tint)
        : tint(object.material);
    });
  }
  private setWeaponSkin(skin: string | null) {
    if (this.currentSkin === skin) return;
    for (const id of WEAPON_IDS) {
      const old = this.weapon.getObjectByName(id);
      if (old) {
        if (this.currentSkin)
          old.traverse((o) => {
            if (o instanceof THREE.Mesh)
              for (const m of Array.isArray(o.material)
                ? o.material
                : [o.material])
                if (m.userData.ownedSkin) m.dispose();
          });
        this.weapon.remove(old);
      }
      const model = this.models[id].clone(true);
      model.name = id;
      this.styleModel(model, skin);
      this.weapon.add(model);
    }
    this.currentSkin = skin;
  }
  private addEquipmentBase(group: THREE.Group, color: string, radius = 18) {
    const energy = new THREE.Group();
    energy.name = "energy";
    this.box(energy, 0, 2, 0, radius * 2.4, 4, radius * 1.8, "#303530");
    this.box(energy, 0, 4.5, 0, radius * 1.9, 1, radius * 1.4, color).name = "marker";
    group.add(energy);
  }
  private impactDecal(e: GameEvent) {
    if (!e.normal) return;
    if (!this.decalTexture) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
      gradient.addColorStop(0, "#080a0b");
      gradient.addColorStop(0.2, "#111415");
      gradient.addColorStop(0.37, "#6a6a64a8");
      gradient.addColorStop(0.65, "#292b2860");
      gradient.addColorStop(1, "#00000000");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      this.decalTexture = new THREE.CanvasTexture(canvas);
    }
    const material = new THREE.MeshBasicMaterial({
      map: this.decalTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const mesh = new THREE.Mesh(this.decalGeometry, material);
    mesh.position.set(
      e.x + e.normal.x * 0.3,
      e.y + e.normal.y * 0.3,
      e.z + e.normal.z * 0.3,
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(e.normal.x, e.normal.y, e.normal.z),
    );
    mesh.rotateZ(((e.id % 12) * Math.PI) / 6);
    this.scene.add(mesh);
    this.decals.push({ mesh, until: performance.now() + 20_000 });
    while (this.decals.length > 80) this.removeDecal(this.decals.shift()!);
  }
  private removeDecal(decal: { mesh: THREE.Mesh }) {
    decal.mesh.parent?.remove(decal.mesh);
    (decal.mesh.material as THREE.Material).dispose();
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
    this.box(
      this.world,
      WIDTH / 2,
      -6,
      DEPTH / 2,
      WIDTH,
      12,
      DEPTH,
      "#6b706d",
    ).material = this.surface("floor");
    const grid: number[] = [];
    for (let x = 0; x <= WIDTH; x += 100) grid.push(x, 0.15, 0, x, 0.15, DEPTH);
    for (let z = 0; z <= DEPTH; z += 100) grid.push(0, 0.15, z, WIDTH, 0.15, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(grid, 3));
    this.world.add(
      new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color: "#5e625f",
          transparent: true,
          opacity: 0.08,
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
      ).material = this.surface(
        b.kind === "floor" ? "steel" : b.kind === "rail" ? "steel" : "concrete",
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
          "#b9a25b",
        );
        for (const band of [12, Math.max(22, b.h - 11)])
          this.box(
            this.world,
            b.x + b.w / 2,
            b.y + band,
            b.z - 0.4,
            b.w - 10,
            2.5,
            1.2,
            "#3d4545",
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
          "#615f56",
        );
    }
    for (let x = 300; x < WIDTH; x += 300) {
      for (const z of [2, DEPTH - 2])
        this.box(this.world, x, 112, z, 8, 224, 6, "#363d40").material =
          this.surface("steel");
    }
    for (let z = 300; z < DEPTH; z += 300) {
      for (const x of [2, WIDTH - 2])
        this.box(this.world, x, 112, z, 6, 224, 8, "#363d40").material =
          this.surface("steel");
    }
    for (const x of [420, 1980])
      for (let z = 350; z < 1300; z += 230)
        this.box(this.world, x, 0.5, z, 95, 1, 3, "#a8986e");
    for (const z of [315, 1285])
      for (let x = 600; x < 2000; x += 280)
        this.box(this.world, x, 0.5, z, 105, 1, 3, "#a8986e");
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
      const mesh = new THREE.Mesh(g, this.surface("steel"));
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
          "#c4b677",
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
    const sign = this.label("SKYBRIDGE  /  FOUNDRY YARD", "#ffc06f", 340);
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
      this.setWeaponSkin(me.skin);
      this.prediction.accept(me, s);
      this.base = this.prediction.body;
      this.network.record(this.receivedAt, this.prediction.correction);
    }
  }
  event(e: GameEvent) {
    if (e.kind === "sniper-spawn") {
      this.burst({ x: e.x, y: 12, z: e.z }, 8, "#c5b790", .35);
    }
    if (e.kind === "sniper-pickup") this.burst(e, 20, "#ffd66e", 0.55);
    if (e.kind === "impact") {
      this.impactDecal(e);
      this.burst(
        e,
        5,
        e.normal && Math.abs(e.normal.y) > 0.5 ? "#aaa89a" : "#d3ad70",
        0.18,
        0,
      );
    }
    if (e.kind === "charge") this.burst(e, 12, "#6fc9ff", 0.5);
    if (e.kind === "battery") this.burst(e, 10, "#6fc9ff", 0.35, 0);
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
    if (e.kind === "sync") {
      this.burst(e, 9, TEAMS[e.team].color, 0.35);
      if (e.source) this.burst(e.source, 9, TEAMS[e.team].color, 0.35);
    }
    if (e.kind === "dash") this.burst(e, 9, "#a5edff", 0.32);
    if (e.kind === "pickup" || e.kind === "use")
      this.burst(e, 7, e.power ? POWER_INFO[e.power].color : "#ffffff", 0.5);
  }
  private burst(
    p: Vec3,
    n: number,
    color: string,
    life: number,
    yOffset = -15,
  ) {
    for (let i = 0; i < n && this.particles.length < 160; i++) {
      const particle = this.particlePool.pop() ?? {
        mesh: this.box(this.scene, p.x, p.y + yOffset, p.z, 4, 4, 4, color),
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
      };
      particle.mesh.material = this.material(color);
      particle.mesh.position.set(p.x, p.y + yOffset, p.z);
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
    for (const effect of this.lightning) {
      effect.mesh.parent?.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      for (const material of Array.isArray(effect.mesh.material) ? effect.mesh.material : [effect.mesh.material]) material.dispose();
    }
    this.lightning = [];
    for (const decal of this.decals) this.removeDecal(decal);
    this.decals = [];
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
    this.skinTime.value = performance.now() / 1000;
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
    const aiming = input.ads && this.base.hp > 0 && s.phase === "playing";
    this.adsRaise = THREE.MathUtils.clamp(this.adsRaise + (aiming ? dt / 0.22 : -dt / 0.16), 0, 1);
    const raised = this.adsRaise * this.adsRaise * (3 - 2 * this.adsRaise);
    const magnification = 1 + ((this.base.weapon === "sniper" ? 4 : this.base.weapon === "rifle" ? 2 : 1) - 1) * raised;
    const fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(78 / 2)) / magnification));
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 18, dt);
      this.camera.updateProjectionMatrix();
    }
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
    this.weapon.visible = me.hp > 0 && s.phase === "playing" && !(me.weapon === "sniper" && raised > .99);
    for (const id of WEAPON_IDS)
      this.weapon.getObjectByName(id)!.visible = id === me.weapon;
    this.muzzle.position.set(0, me.weapon === "sniper" || me.weapon === "shotgun" ? 1.2 : 0, WEAPON_PRESENTATION[me.weapon].muzzleZ);
    this.laserGlow.position.copy(this.muzzle.position);
    this.laserGlow.visible = false;
    const wall = rayWorld(
      this.arena,
      eye,
      direction(input.aim, input.pitch),
      70,
    );
    const retract = wall ? (1 - wall.distance / 70) * 18 : 0;
    const pose = weaponViewPose(me.weapon, raised);
    this.weapon.position.x = pose.x;
    this.weapon.position.z = pose.z + this.recoil * 2 + retract * (1 - raised);
    this.weapon.position.y =
      pose.y -
      (me.reloadUntil > now
        ? Math.sin((me.reloadUntil - now) / 200) * 3 + 5
        : 0);
    this.weapon.rotation.x = -.025 * (1 - raised);
    this.weapon.rotation.z = (me.reloadUntil > now ? -.25 : -.045 * (1 - raised));
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
        const rig = createCharacterRig(this.models, TEAMS[p.team].color,
          (color) => this.material(color), (model) => this.styleModel(model, p.skin));
        group = rig.root;
        this.playerRigs.set(p.id, rig);
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
      updateCharacterRig(this.playerRigs.get(p.id)!, p, now, motionMs / 1000);
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
        this.playerRigs.delete(id);
      }
    for (const p of s.pickups) {
      let g = this.pickups.get(p.id);
      if (!g) {
        g = new THREE.Group();
        const cube = this.box(
          g,
          0,
          17,
          0,
          24,
          24,
          24,
          "#4d5542",
        );
        cube.name = "cube";
        this.box(g, 0, 17, 12.2, 18, 6, .5, POWER_INFO[p.kind].color).name = "stripe";
        this.box(g, 0, 30, 0, 15, 3, 6, "#272d25");
        for (const x of [-9, 9]) this.box(g, x, 17, 12.3, 2, 24, .7, "#323b2c");
        this.addEquipmentBase(g, POWER_INFO[p.kind].color);
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
        (g.getObjectByName("stripe") as THREE.Mesh).material = this.material(
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
        (g.getObjectByName("marker") as THREE.Mesh).material = this.material(POWER_INFO[p.kind].color);
      }
      g.visible = p.readyAt === 0;
      g.position.set(p.x, p.y, p.z);
    }
    for (const p of s.batteries) {
      let group = this.batteryMeshes.get(p.id);
      if (!group) {
        group = new THREE.Group();
        this.addEquipmentBase(group, "#75d9ff", 16);
        this.box(group, 0, 17, 0, 25, 24, 16, "#4c5848");
        this.box(group, 0, 30, 0, 14, 3, 6, "#273326");
        this.box(group, 0, 17, 8.2, 14, 4, .6, "#e7e6d9");
        this.box(group, 0, 17, 8.3, 4, 14, .6, "#e7e6d9");
        const label = this.label("CELL", "#8de0ff", 68);
        label.position.y = 66;
        group.add(label);
        this.scene.add(group);
        this.batteryMeshes.set(p.id, group);
      }
      group.visible = p.readyAt === 0;
      group.position.set(p.x, p.y, p.z);
    }
    if (!this.sniperMesh) {
      this.sniperMesh = new THREE.Group();
      const model = this.models.sniper.clone(true);
      model.position.y = 15;
      model.rotation.y = Math.PI / 2;
      this.sniperMesh.add(model);
      this.addEquipmentBase(this.sniperMesh, "#c8b66c", 25);
      this.scene.add(this.sniperMesh);
    }
    this.sniperMesh.visible = s.sniper.available;
    this.sniperMesh.position.set(s.sniper.x, s.sniper.y, s.sniper.z);
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
    const activeDecals: typeof this.decals = [];
    for (const decal of this.decals) {
      if (performance.now() >= decal.until) this.removeDecal(decal);
      else activeDecals.push(decal);
    }
    this.decals = activeDecals;
    this.lightning = this.lightning.filter(({ mesh, until }) => {
      if (performance.now() < until) {
        (mesh.material as THREE.LineBasicMaterial).opacity = Math.max(0, (until - performance.now()) / 500);
        return true;
      }
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
      return false;
    });
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
  scopeProgress() { return this.adsRaise; }
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
      const tracer = SHOP.find(
        (item) => item.id === b.tracer && item.type === "tracer",
      );
      mesh.material = this.material(tracer?.color ?? "#ffe8aa");
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
        this.burst(b.end, b.weapon === "sniper" ? 8 : 3, "#d1ba8f", .18);
      }
      mesh.material = b.weapon === "sniper" ? this.sniperBeamMaterial : this.laserMaterial;
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
      mesh.scale.set(b.weapon === "sniper" ? 2.5 : 1.5, b.weapon === "sniper" ? 2.5 : 1.5, length);
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
    for (const p of s.batteries)
      if (!p.readyAt) {
        c.fillStyle = "#74d5ff";
        c.fillRect(p.x * scale - 3, p.z * scale - 3, 6, 6);
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
        if (o.userData.weaponAsset) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            if (m.userData.ownedSkin) m.dispose();
          return;
        }
        if (o.geometry !== this.unit && !o.userData.sharedGeometry) o.geometry.dispose();
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
    for (const material of this.surfaceMaterials.values()) {
      material.map?.dispose();
      material.normalMap?.dispose();
      material.roughnessMap?.dispose();
      material.dispose();
    }
    this.decalGeometry.dispose();
    this.decalTexture?.dispose();
    this.laserMaterial.dispose();
    this.sniperBeamMaterial.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.scene.clear();
    this.weaponScene.clear();
    this.playerRigs.clear();
  }
}
