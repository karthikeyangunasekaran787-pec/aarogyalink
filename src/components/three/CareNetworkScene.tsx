// ============================================================================
// AarogyaLink — Care Loop network visualisation (Three.js)
// ----------------------------------------------------------------------------
// A single lightweight, self-contained scene that renders the referral loop as
// a ring of facilities/actors:
//
//   Patient → Health Worker → Facility → Doctor → Treatment → Follow-up → Closed
//
// Design constraints (deliberate, for a public-health product on rural devices):
//   • core three only — no post-processing, no example add-ons, no textures;
//   • one shared sphere geometry and one line geometry (cheap draw calls);
//   • the render loop pauses when the tab is hidden or the canvas scrolls out of
//     view, and stops entirely when the component unmounts;
//   • prefers-reduced-motion renders ONE static frame instead of animating;
//   • pixel ratio and antialiasing step down on small screens;
//   • no WebGL (or a context failure) simply renders nothing — the surrounding
//     page must never depend on the canvas to be legible.
//
// Labels are NOT drawn in the canvas: the hero renders real text over it, so the
// information is available to screen readers and to devices without WebGL.
// ============================================================================

import { useEffect, useRef } from 'react';
// Named imports so the bundler can tree-shake three.js down to what the scene
// actually uses. `import * as THREE` pulls in the whole library (measured at
// ~528 kB / 132 kB gzip) for a decorative hero visual.
import {
  AmbientLight, BufferAttribute, BufferGeometry, Clock, DirectionalLight, Group,
  Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PerspectiveCamera, Points, PointsMaterial, Scene, SphereGeometry, Vector3,
  WebGLRenderer,
} from 'three';

/** The loop stages, in engine order. Colours echo the status palette. */
const STAGES = [
  { key: 'patient', color: 0x2563eb },
  { key: 'health_worker', color: 0x0ea5e9 },
  { key: 'facility', color: 0x0d9488 },
  { key: 'doctor', color: 0x14b8a6 },
  { key: 'treatment', color: 0x16a34a },
  { key: 'followup', color: 0x65a30d },
  { key: 'closed', color: 0x0f766e },
] as const;

const RING_RADIUS = 2.55;
const NODE_RADIUS = 0.2;

export interface CareNetworkSceneProps {
  /** Extra classes for the canvas wrapper. */
  className?: string;
  /** Visual density. `compact` is used inside dashboard panels. */
  density?: 'full' | 'compact';
}

export default function CareNetworkScene({ className, density = 'full' }: CareNetworkSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Hoisted function declarations lose the narrowing above, so keep an
    // explicitly non-null binding for the helpers below.
    const hostEl: HTMLDivElement = host;

    const compact = density === 'compact';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isSmallScreen = window.innerWidth < 768;

    // ── Renderer (bail out silently when WebGL is unavailable) ──────────────
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        alpha: true,
        antialias: !isSmallScreen && !compact,
        powerPreference: 'low-power',
      });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmallScreen ? 1.5 : 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    hostEl.appendChild(renderer.domElement);

    // ── Scene ───────────────────────────────────────────────────────────────
    const scene = new Scene();
    const camera = new PerspectiveCamera(compact ? 50 : 45, 1, 0.1, 100);
    camera.position.set(0, compact ? 2.1 : 2.6, compact ? 6.4 : 6.6);
    camera.lookAt(0, 0, 0);

    const group = new Group();
    scene.add(group);

    scene.add(new AmbientLight(0xffffff, 1.15));
    const keyLight = new DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);
    const rimLight = new DirectionalLight(0x88ccdd, 0.5);
    rimLight.position.set(-4, -2, -3);
    scene.add(rimLight);

    // ── Nodes ───────────────────────────────────────────────────────────────
    const disposables: { dispose: () => void }[] = [];
    const sphereGeometry = new SphereGeometry(NODE_RADIUS, compact ? 16 : 24, compact ? 12 : 18);
    disposables.push(sphereGeometry);

    const haloGeometry = new SphereGeometry(NODE_RADIUS * 2.1, 16, 12);
    disposables.push(haloGeometry);

    const positions: Vector3[] = [];
    const nodes: { mesh: Mesh; halo: Mesh; base: Vector3; phase: number }[] = [];

    const startAngle = -Math.PI / 2;
    STAGES.forEach((stage, i) => {
      const angle = startAngle + (i / STAGES.length) * Math.PI * 2;
      const base = new Vector3(
        Math.cos(angle) * RING_RADIUS,
        Math.sin(angle) * RING_RADIUS * (compact ? 0.42 : 0.5),
        Math.sin(angle * 1.3) * (compact ? 0.18 : 0.28),
      );
      positions.push(base.clone());

      const material = new MeshStandardMaterial({
        color: stage.color,
        roughness: 0.42,
        metalness: 0.12,
      });
      disposables.push(material);
      const mesh = new Mesh(sphereGeometry, material);
      mesh.position.copy(base);
      group.add(mesh);

      // Soft halo reads as depth without any post-processing pass.
      const haloMaterial = new MeshBasicMaterial({
        color: stage.color,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
      disposables.push(haloMaterial);
      const halo = new Mesh(haloGeometry, haloMaterial);
      halo.position.copy(base);
      group.add(halo);

      nodes.push({ mesh, halo, base, phase: i * 0.9 });
    });

    // ── Connecting lines ────────────────────────────────────────────────────
    // The muted ring shows the pathway; the teal segment closes the loop.
    const ringPoints = positions.map(p => p.clone());
    const ringGeometry = new BufferGeometry().setFromPoints([...ringPoints, ringPoints[0]]);
    disposables.push(ringGeometry);
    const ringMaterial = new LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.28,
    });
    disposables.push(ringMaterial);
    group.add(new Line(ringGeometry, ringMaterial));

    const closureGeometry = new BufferGeometry().setFromPoints([
      positions[positions.length - 1].clone(),
      positions[0].clone(),
    ]);
    disposables.push(closureGeometry);
    const closureMaterial = new LineBasicMaterial({
      color: 0x0d9488,
      transparent: true,
      opacity: 0.55,
    });
    disposables.push(closureMaterial);
    group.add(new Line(closureGeometry, closureMaterial));

    // ── Ambient depth particles ─────────────────────────────────────────────
    const particleCount = compact ? 70 : 160;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 11;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 5 - 1.5;
    }
    const particleGeometry = new BufferGeometry();
    particleGeometry.setAttribute('position', new BufferAttribute(particlePositions, 3));
    disposables.push(particleGeometry);
    const particleMaterial = new PointsMaterial({
      color: 0x0f766e,
      size: 0.032,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    disposables.push(particleMaterial);
    group.add(new Points(particleGeometry, particleMaterial));

    // ── Sizing ──────────────────────────────────────────────────────────────
    function resize() {
      const width = hostEl.clientWidth;
      const height = hostEl.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostEl);

    // ── Render loop (paused when hidden or off-screen) ──────────────────────
    let frame = 0;
    let running = true;
    let visible = true;
    const clock = new Clock();

    function renderFrame() {
      const t = reduceMotion ? 0 : clock.getElapsedTime();

      group.rotation.y = reduceMotion ? -0.35 : -0.35 + Math.sin(t * 0.13) * 0.22;
      group.rotation.x = reduceMotion ? 0.06 : 0.06 + Math.sin(t * 0.09) * 0.04;

      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        const bob = reduceMotion ? 0 : Math.sin(t * 0.7 + node.phase) * 0.075;
        node.mesh.position.set(node.base.x, node.base.y + bob, node.base.z);
        // The halo trails its node slightly, which implies motion without work.
        node.halo.position.set(node.base.x, node.base.y + bob * 1.35, node.base.z);
      }

      if (!reduceMotion) {
        camera.position.x = Math.sin(t * 0.08) * 0.28;
        camera.position.y = (compact ? 2.1 : 2.6) + Math.sin(t * 0.11) * 0.14;
        camera.lookAt(0, 0, 0);
      }

      renderer.render(scene, camera);
    }

    function loop() {
      if (!running) return;
      if (visible && !document.hidden) renderFrame();
      frame = requestAnimationFrame(loop);
    }

    // Reduced motion: paint a single static frame and stop.
    if (reduceMotion) {
      renderFrame();
    } else {
      frame = requestAnimationFrame(loop);
    }

    // Only animate while the canvas is actually on screen.
    const intersectionObserver = new IntersectionObserver(
      entries => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.01 },
    );
    intersectionObserver.observe(hostEl);

    const onVisibility = () => {
      if (!document.hidden && !reduceMotion) {
        clock.getDelta();
        renderFrame();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      scene.clear();
      for (const item of disposables) item.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === hostEl) hostEl.removeChild(renderer.domElement);
    };
  }, [density]);

  return (
    <div
      ref={hostRef}
      className={className}
      aria-hidden="true"
      // The scene is decorative: every fact it depicts is also rendered as text.
    />
  );
}
