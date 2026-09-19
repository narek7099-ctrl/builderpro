/* The hero object: a cube of frosted-glass tiles, a few of them solid blue.
   It assembles on load, then the pinned story drives it through four
   states, blended by scroll progress:
     0  the cube, whole                                  (hero)
     1  one blue tile lifts out and hovers               (Lisa answers)
     2  the cube opens up, every tile its own card       (every job, one card)
     3  it packs back together, turned, and settles      (the whole system)
   Driven from site.js through mount(canvas).setProgress(p).

   Rendering notes. The tiles are real transmissive glass on machines that
   can carry the extra pass (a fine pointer is the proxy for that); on
   touch devices they are a milky opaque material that reads the same from
   a metre away. One directional key light casts a soft contact shadow onto
   a shadow-only plane, so the object sits on the page rather than in a
   room. No floor, no fog, nothing to compete with the cube. */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const GROUND = 0xedf2f6;
const BLUE = 0x006fff;

const outExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/* a cheap deterministic hash in [0,1) so every tile scatters its own way, the same way each load */
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function mount(canvas) {
  if (!canvas || canvas._bpHero) return null;
  canvas._bpHero = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer:coarse)').matches;
  const fine = matchMedia('(pointer:fine)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(GROUND, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GROUND);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe5ee, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(5, 9, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.camera.near = 1; key.shadow.camera.far = 30;
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03; key.shadow.radius = 6;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdbe6ff, 0.5); fill.position.set(-6, 3, -3); scene.add(fill);

  /* the ground is only a shadow: the page canvas shows through everywhere else */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ color: 0x0b1021, opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2.05; ground.receiveShadow = true; scene.add(ground);

  /* materials */
  const glass = fine && !coarse
    ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.42, metalness: 0, transmission: 1, thickness: 0.9, ior: 1.42,
        attenuationColor: new THREE.Color(0xeaf0fb), attenuationDistance: 2.2,
        clearcoat: 0.7, clearcoatRoughness: 0.28, envMapIntensity: 0.9, specularIntensity: 0.6,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0xf5f7fb, roughness: 0.46, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3,
        envMapIntensity: 0.85, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xe4ecff),
      });
  const blue = new THREE.MeshPhysicalMaterial({
    color: BLUE, roughness: 0.28, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.0,
  });

  /* the tiles: a 3 x 3 x 3 grid, four of them blue on the faces the camera sees */
  const N = 3, SIZE = 1, GAP = 0.13, PITCH = SIZE + GAP;
  const geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.13);
  const BLUES = { '1,1,1': 1, '-1,1,0': 1, '1,-1,1': 1, '0,1,-1': 1 };
  const HERO = '1,1,1';                       /* the tile that lifts out */
  const tiles = [];
  let idx = 0;
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const k = x + ',' + y + ',' + z;
    const mesh = new THREE.Mesh(geo, BLUES[k] ? blue : glass);
    mesh.castShadow = true; mesh.receiveShadow = false;
    const h = hash(idx + 1), h2 = hash(idx + 40), h3 = hash(idx + 80);
    tiles.push({
      mesh, gx: x, gy: y, gz: z, hero: k === HERO, i: idx,
      base: new THREE.Vector3(x * PITCH, y * PITCH, z * PITCH),
      /* where it starts on load: out in a loose cloud, turned any old way */
      scatter: new THREE.Vector3((h - 0.5) * 11, 2.5 + h2 * 6, (h3 - 0.5) * 11),
      scatterRot: new THREE.Euler((h - 0.5) * 3, (h2 - 0.5) * 3, (h3 - 0.5) * 3),
      spin: (h2 - 0.5) * 0.5,
      /* order of arrival: bottom layer first, then up, with a little noise */
      delay: (y + 1) * 0.16 + h3 * 0.28,
    });
    idx++;
    scene.add(mesh);
  }
  const group = new THREE.Group(); tiles.forEach((t) => group.add(t.mesh)); scene.add(group);

  /* per-state target for a tile, into out.pos / out.rot; the group turn is separate */
  const tmpP = new THREE.Vector3(), tmpR = new THREE.Euler();
  function target(t, s, out) {
    const b = t.base;
    if (s === 0) { out.pos.copy(b); out.rot.set(0, 0, 0); return; }
    if (s === 1) {
      if (t.hero) { out.pos.set(b.x + 0.35, b.y + 1.9, b.z + 0.35); out.rot.set(0.35, 0.8, -0.18); }
      else { out.pos.copy(b); out.rot.set(0, 0, 0); }
      return;
    }
    if (s === 2) {
      /* opened up: every tile pushed out along its own offset, a touch of turn each */
      const k = 2.15;
      out.pos.set(b.x * k, b.y * k + 0.3, b.z * k);
      out.rot.set(t.spin * 0.6, t.spin, t.spin * -0.4);
      return;
    }
    /* 3: packed again, sat a little lower, the last tile home */
    out.pos.set(b.x, b.y - 0.28, b.z); out.rot.set(0, 0, 0);
  }
  const GROUP_Y = [0.72, 1.05, 1.95, 3.1];   /* how far the whole cube has turned in each state: a three-quarter view to start */
  const A = { pos: new THREE.Vector3(), rot: new THREE.Euler() }, B = { pos: new THREE.Vector3(), rot: new THREE.Euler() };

  let want = 0, prog = 0, intro = 0, t0 = performance.now(), tPrev = t0, running = false;
  let mx = 0, my = 0, tmx = 0, tmy = 0;

  function apply(p, time) {
    const seg = clamp(p * 3, 0, 2.999);
    const a = Math.floor(seg), b = Math.min(3, a + 1), t = inOut(seg - a);
    const packed = 1 - clamp(Math.abs(seg - 2), 0, 1);    /* 1 while fully open */
    const idle = reduce ? 0 : 1;
    for (const tile of tiles) {
      target(tile, a, A); target(tile, b, B);
      tmpP.lerpVectors(A.pos, B.pos, t);
      tmpR.set(lerp(A.rot.x, B.rot.x, t), lerp(A.rot.y, B.rot.y, t), lerp(A.rot.z, B.rot.z, t));
      /* the load-in: from the scatter cloud to wherever the story wants it */
      const k = outExpo(clamp((intro - tile.delay) / 0.9, 0, 1));
      tile.mesh.position.lerpVectors(tile.scatter, tmpP, k);
      tile.mesh.rotation.set(lerp(tile.scatterRot.x, tmpR.x, k), lerp(tile.scatterRot.y, tmpR.y, k), lerp(tile.scatterRot.z, tmpR.z, k));
      /* a slow breathe once it is open, so the cloud feels held rather than frozen */
      if (packed > 0 && idle) tile.mesh.position.y += Math.sin(time * 0.9 + tile.i * 0.7) * 0.05 * packed;
    }
    group.rotation.y = lerp(GROUP_Y[a], GROUP_Y[b], t) + idle * time * 0.06;
    group.position.y = idle * Math.sin(time * 0.7) * 0.06;
    /* camera: a little orbit, a little parallax, and a slow push in as the story ends */
    const dist = 10.6 - p * 0.8;
    const orbit = 0.62 + mx * 0.12 + p * 0.15;
    camera.position.set(Math.sin(orbit) * dist, 4.9 + my * 0.5 - p * 0.4, Math.cos(orbit) * dist);
    camera.lookAt(0, 0.15, 0);
  }

  function size() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 40 : 28;
    camera.updateProjectionMatrix();
  }

  /* nothing to draw for while the portal, the menu or a legal page covers the screen */
  const covered = () => document.body.style.overflow === 'hidden' || document.body.classList.contains('is-locked');

  function frame() {
    if (!running) return;
    if (covered()) { tPrev = performance.now(); if (!reduce) requestAnimationFrame(frame); return; }
    const now = performance.now(), dt = Math.min(0.1, (now - tPrev) / 1000); tPrev = now;
    const time = (now - t0) / 1000;
    intro = reduce ? 1 : Math.min(1.6, intro + dt);
    prog += (want - prog) * (1 - Math.exp(-dt * 5.5));
    mx += (tmx - mx) * (1 - Math.exp(-dt * 3.5)); my += (tmy - my) * (1 - Math.exp(-dt * 3.5));
    apply(prog, time);
    renderer.render(scene, camera);
    if (!reduce) requestAnimationFrame(frame);
  }

  function start() { if (running) return; running = true; tPrev = performance.now(); size(); requestAnimationFrame(frame); }
  function stop() { running = false; }

  const io = new IntersectionObserver((es) => { es.some((e) => e.isIntersecting) ? start() : stop(); }, { threshold: 0 });
  io.observe(canvas);
  addEventListener('resize', () => { size(); if (reduce) { apply(prog, 0); renderer.render(scene, camera); } }, { passive: true });
  if (fine && !reduce) {
    addEventListener('pointermove', (e) => { tmx = (e.clientX / innerWidth - 0.5) * 2; tmy = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
  }
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });

  size();
  if (reduce) intro = 1;
  apply(0, 0);
  renderer.render(scene, camera);
  start();

  return {
    setProgress(p) {
      want = clamp(p, 0, 1);
      if (reduce) { prog = want; apply(prog, 0); renderer.render(scene, camera); }
    },
  };
}
