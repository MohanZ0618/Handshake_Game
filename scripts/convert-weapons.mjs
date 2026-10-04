import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import * as THREE from "three";
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
  async readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
    this.onloadend?.();
  }
};
let compressed = 0;
for (const id of ["rifle", "smg", "shotgun"]) {
  const data = await readFile(`assets/legacy-weapons/${id}.fbx`);
  const model = new FBXLoader().parse(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    "",
  );
  model.animations = [];
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    mesh.material = materials.map(
      (m) =>
        new THREE.MeshStandardMaterial({
          color: m.color,
          roughness: 0.45,
          metalness: 0.3,
        }),
    );
  });
  const box = new THREE.Box3().setFromObject(model);
  console.log(id, box.min.toArray(), box.max.toArray());
  const result = await new GLTFExporter().parseAsync(model, { binary: true });
  await writeFile(`assets/legacy-weapons/${id}.glb`, Buffer.from(result));
  compressed += gzipSync(Buffer.from(result)).length;
}
console.log(`Combined gzip bytes: ${compressed}`);
if (compressed > 3_000_000) throw new Error("Weapons exceed asset budget");
