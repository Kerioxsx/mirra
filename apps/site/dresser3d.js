// The dresser section's 3D figure: Mirra's own avatar wearing looks baked by the app's engine
// (packages/dresser-engine/scripts/bake-looks.bake.ts), turned by dragging.
//
// Progressive: the poster image stays until WebGL is up and the model is in, and stays for good
// without WebGL or JavaScript. three.js and the model load only when the section comes near.
// Turning is horizontal only and the wheel is left alone, so the page always scrolls.

const MIRROR = "https://cdn.jsdelivr.net/gh/Kerioxsx/mirra@f3851ed/apps/site/looks/";

const root = document.querySelector("[data-dresser3d]");
if (root) {
  const near = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        near.disconnect();
        start(root).catch((err) => {
          console.warn("dresser3d: showing the picture instead of the 3D figure", err);
          fail(root);
        });
      }
    },
    { rootMargin: "500px 0px" },
  );
  near.observe(root);
}

function webgl() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

function say(root, text) {
  const status = root.querySelector("[data-d3-status]");
  status.textContent = text;
  status.hidden = !text;
}

function fail(root) {
  say(root, "");
  root.classList.remove("is-3d");
}

/** Fetches a file, reporting progress (0..1) when the size is known. */
async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.byteLength;
    if (total) onProgress(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out.buffer;
}

async function start(root) {
  if (!webgl()) return; // the poster is the fallback
  say(root, "Loading the 3D figure…");
  const [THREE, { GLTFLoader }, { RoomEnvironment }] = await Promise.all([
    import("three"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/environments/RoomEnvironment.js"),
  ]);

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = matchMedia("(pointer: coarse)").matches;
  const canvas = root.querySelector("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  // phones get fewer pixels: the figure stays sharp enough and the battery lasts
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight("#f3efe6", "#1a1a1e", 0.6));
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(2.2, 4.2, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#dfe9ff", 1.1);
  rim.position.set(-3, 2.4, -2.5);
  scene.add(rim);

  // the studio floor: a soft contact shadow and the app's volt ring
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.8),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.635, 96),
    new THREE.MeshBasicMaterial({ color: "#d6ff3d", transparent: true, opacity: 0.35 }),
  );
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
  const turn = new THREE.Group(); // the figure's own turn
  turn.rotation.y = -0.35;
  scene.add(turn);

  // framing: the whole figure with a little air, whatever the frame's shape
  const frame = (height) => {
    const { clientWidth: w, clientHeight: h } = root;
    camera.aspect = w / h;
    // the figure fills ~75% of the height, raised clear of the look buttons along the bottom
    const span = height * 1.34;
    const fitH = span / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const fitW = fitH * Math.max(1, (0.62 * 2.3) / (span * camera.aspect));
    const d = Math.max(fitH, fitW);
    camera.position.set(0, height * 0.5, d);
    camera.lookAt(0, height * 0.43, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  let height = 1.76;
  new ResizeObserver(() => {
    frame(height);
    wake();
  }).observe(root);

  // looks: loaded once each, on demand
  const loader = new GLTFLoader();
  const cache = new Map();
  const progress = (f) => say(root, `Loading the 3D figure… ${Math.round(f * 100)}%`);
  const load = (id) => {
    if (!cache.has(id)) {
      // the site's own copy first; where a host can't serve .glb files, the same file from the
      // public repository through jsDelivr (pinned to the commit that added the looks)
      const p = fetchWithProgress(`looks/${id}.glb`, progress)
        .catch(() => fetchWithProgress(`${MIRROR}${id}.glb`, progress))
        .then((buf) => loader.parseAsync(buf, ""));
      p.catch(() => cache.delete(id));
      cache.set(id, p);
    }
    return cache.get(id);
  };
  let current = null;
  const show = async (id) => {
    say(root, "Loading the 3D figure…");
    const gltf = await load(id);
    if (current) turn.remove(current);
    current = gltf.scene;
    turn.add(current);
    const box = new THREE.Box3().setFromObject(current);
    height = box.max.y;
    frame(height);
    say(root, "");
    root.classList.add("is-3d");
    wake();
  };

  // turning: drag (horizontal), arrow keys, and a slow turntable unless motion is reduced
  let velocity = 0;
  let idleUntil = 0;
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastT = e.timeStamp;
    velocity = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const step = (e.clientX - lastX) * 0.012;
    const dt = Math.max(1 / 120, (e.timeStamp - lastT) / 1000);
    lastX = e.clientX;
    lastT = e.timeStamp;
    turn.rotation.y += step;
    // the flick's speed (radians a second), smoothed and capped so a fling settles, not spins
    velocity = Math.max(-5, Math.min(5, velocity * 0.6 + (step / dt) * 0.4));
    idleUntil = performance.now() + 4000;
    wake();
  });
  const release = () => {
    dragging = false;
    wake();
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    turn.rotation.y += (e.key === "ArrowLeft" ? -1 : 1) * (Math.PI / 12);
    idleUntil = performance.now() + 4000;
    wake();
  });

  // draw only while on screen and something moves
  let visible = true;
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    wake();
  }).observe(root);
  let raf = 0;
  let then = performance.now();
  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - then) / 1000);
    then = now;
    let moving = false;
    if (!dragging && Math.abs(velocity) > 0.01) {
      turn.rotation.y += velocity * dt;
      velocity *= Math.pow(0.04, dt); // inertia, settling in about a second
      moving = true;
    }
    if (!reduced.matches && !dragging && now > idleUntil) {
      turn.rotation.y += 0.22 * dt;
      moving = true;
    }
    renderer.render(scene, camera);
    if ((moving || dragging) && visible) wake();
  }
  function wake() {
    if (!raf && visible) {
      then = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  reduced.addEventListener("change", wake);

  // the look buttons
  const buttons = [...root.querySelectorAll("[data-look]")];
  for (const b of buttons) {
    b.addEventListener("click", () => {
      if (b.getAttribute("aria-pressed") === "true") return;
      for (const o of buttons) o.setAttribute("aria-pressed", String(o === b));
      canvas.setAttribute("aria-label", b.dataset.label);
      show(b.dataset.look).catch(() => say(root, "Couldn't load that look."));
    });
  }
  const first = buttons.find((b) => b.getAttribute("aria-pressed") === "true") ?? buttons[0];
  await show(first.dataset.look);
}
