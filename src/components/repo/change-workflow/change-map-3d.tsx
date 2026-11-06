import type { ChangeMapNode, MapDependency } from "@/lib/change-workflow/model";
import { layoutTiles, nodeName, type MapIndex } from "@/lib/change-workflow-ui/map-layout";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const SIZE = 20;
const COLORS = { both: 0x8b5cf6, pr: 0x0ea5e9, session: 0xf59e0b, directory: 0x64748b, file: 0x94a3b8 };

/** Shown row that contains `file`: itself or its nearest displayed ancestor directory. */
function shownAncestor(file: string, shown: Set<string>): string | null {
  for (let id = file; id; id = id.slice(0, Math.max(0, id.lastIndexOf("/")))) if (shown.has(id)) return id;
  return null;
}

/**
 * Optional spatial view of the same rows as the 2D map: footprint from the treemap layout,
 * height from file count, lines only for analysed source-import edges. The list stays the
 * accessible primary view; this canvas is supplementary.
 */
export default function ChangeMap3D({ rows, index, dependencies, selected, onChoose }: {
  rows: ChangeMapNode[];
  index: MapIndex;
  dependencies: MapDependency[];
  selected: string | null;
  onChoose: (id: string) => void;
}) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const chooseRef = useRef(onChoose);
  chooseRef.current = onChoose;
  const [hover, setHover] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const shownEdges = useRef(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      setFailed(String(e));
      return;
    }
    setFailed(null);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-hidden", "true");

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(10, 30, 20);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(0, 26, 26);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.listenToKeyEvents(renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2.1;

    const disposables: { dispose: () => void }[] = [];
    const meshes: THREE.Mesh[] = [];
    const centers = new Map<string, THREE.Vector3>();
    const maxLeaves = Math.max(1, ...rows.map((n) => index.leaves.get(n.id) ?? 1));
    for (const { item: n, rect } of layoutTiles(rows.map((n) => ({ item: n, weight: index.leaves.get(n.id) ?? 1 })))) {
      const h = 0.3 + 6 * Math.log1p(index.leaves.get(n.id) ?? 1) / Math.log1p(maxLeaves);
      const w = Math.max(0.05, rect.w * SIZE - 0.15);
      const d = Math.max(0.05, rect.h * SIZE - 0.15);
      const pr = n.pullRequests.length > 0;
      const ses = n.sessions.length > 0;
      const geometry = new THREE.BoxGeometry(w, h, d);
      const material = new THREE.MeshStandardMaterial({
        color: pr && ses ? COLORS.both : pr ? COLORS.pr : ses ? COLORS.session : n.kind === "directory" ? COLORS.directory : COLORS.file,
        emissive: n.id === selected ? 0x333333 : 0x000000,
      });
      disposables.push(geometry, material);
      const mesh = new THREE.Mesh(geometry, material);
      const cx = (rect.x + rect.w / 2) * SIZE - SIZE / 2;
      const cz = (rect.y + rect.h / 2) * SIZE - SIZE / 2;
      mesh.position.set(cx, h / 2, cz);
      mesh.userData.id = n.id;
      scene.add(mesh);
      meshes.push(mesh);
      centers.set(n.id, new THREE.Vector3(cx, h + 0.2, cz));
    }

    const shown = new Set(centers.keys());
    const pairs = new Set<string>();
    const points: THREE.Vector3[] = [];
    for (const dep of dependencies) {
      const a = shownAncestor(dep.from, shown);
      const b = shownAncestor(dep.to, shown);
      if (!a || !b || a === b || pairs.has(`${a}\0${b}`)) continue;
      pairs.add(`${a}\0${b}`);
      points.push(centers.get(a)!, centers.get(b)!);
    }
    shownEdges.current = pairs.size;
    if (points.length) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0xe11d48 });
      disposables.push(geometry, material);
      scene.add(new THREE.LineSegments(geometry, material));
    }

    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const ray = new THREE.Raycaster();
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      return (ray.intersectObjects(meshes)[0]?.object.userData.id as string | undefined) ?? null;
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    // A click selects; a drag only orbits.
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) {
        const id = pick(e);
        if (id) chooseRef.current(id);
      }
      down = null;
    };
    const onMove = (e: PointerEvent) => setHover(pick(e));
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointermove", onMove);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onMove);
      observer.disconnect();
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, [rows, index, dependencies, selected]);

  if (failed) return <p role="alert" className="text-[0.6875rem] text-destructive">{t("changeMap.webglFailed", { error: failed })}</p>;
  return (
    <figure className="space-y-1">
      <div ref={host} className="relative h-72 overflow-hidden rounded-md border border-border/50 bg-muted/20" />
      <figcaption className="text-[0.625rem] text-muted-foreground" aria-live="polite">
        {hover ? nodeName(hover) + ` · ${hover}` : t("changeMap.spaceSummary", { nodes: rows.length, edges: shownEdges.current })}
      </figcaption>
    </figure>
  );
}
