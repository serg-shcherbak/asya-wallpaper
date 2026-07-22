"use client";

import { Billboard } from "@react-three/drei";
import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackSide, Group, SRGBColorSpace, Texture, TextureLoader } from "three";
import type { Island, QualityLevel, Sample } from "@/lib/types";
import { resolveSampleAsset } from "@/lib/data";
import { ViewControls } from "./Controls";
import { allocateLods, type LodTier } from "./lod";
import { Nebula } from "./Nebula";
import { toSpherePosition } from "./sceneMath";

const WORLD_RADIUS = 9;

function WorldDust({ count = 260 }: { count?: number }) {
  const positions = useMemo(() => {
    const points = new Float32Array(count * 3);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < count; index += 1) {
      const y = 1 - (index / Math.max(1, count - 1)) * 2;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * index;
      const radius = 8.1 + ((index * 37) % 23) / 30;
      points[index * 3] = Math.cos(theta) * radial * radius;
      points[index * 3 + 1] = y * radius;
      points[index * 3 + 2] = Math.sin(theta) * radial * radius;
    }
    return points;
  }, [count]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#d8ced2" size={0.026} transparent opacity={0.32} depthWrite={false} toneMapped={false} />
    </points>
  );
}

function Wallpaper({
  sample,
  lod,
  focused,
  selected,
  onToggle,
  onHover,
}: {
  sample: Sample;
  lod: LodTier;
  focused: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const group = useRef<Group>(null);
  const [loaded, setLoaded] = useState<{ source: string; texture: Texture | null; failed: boolean } | null>(null);
  const source = lod === "color" ? null : resolveSampleAsset(sample, lod);
  const texture = loaded?.source === source ? loaded.texture : null;
  const textureFailed = loaded?.source === source ? loaded.failed : false;

  useEffect(() => {
    if (!source) return;
    let active = true;
    let activeTexture: Texture | null = null;
    const loader = new TextureLoader();
    loader.load(
      source,
      (loaded) => {
        if (!active) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = SRGBColorSpace;
        activeTexture = loaded;
        setLoaded({ source, texture: loaded, failed: false });
      },
      undefined,
      () => {
        if (active) {
          setLoaded({ source, texture: null, failed: true });
        }
      },
    );
    return () => {
      active = false;
      activeTexture?.dispose();
    };
  }, [source]);

  useFrame((_, delta) => {
    if (!group.current) return;
    const target = selected ? 1.34 : focused ? 1.18 : lod === "color" ? 0.72 : 1;
    const next = group.current.scale.x + (target - group.current.scale.x) * Math.min(1, delta * 7);
    group.current.scale.setScalar(next);
  });

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 5) return;
    event.stopPropagation();
    onToggle(sample.id);
  };

  return (
    <Billboard position={toSpherePosition(sample.pos, WORLD_RADIUS)} follow>
      <group ref={group}>
        {lod !== "color" ? (
          <mesh position={[0, 0, -0.018]} scale={1.055}>
            <planeGeometry args={[1.1, 1.1]} />
            <meshBasicMaterial color={sample.dominantColor} toneMapped={false} />
          </mesh>
        ) : null}
        <mesh
          onClick={onClick}
          onPointerOver={(event) => {
            event.stopPropagation();
            onHover(sample.id);
          }}
          onPointerOut={() => onHover(null)}
        >
          <planeGeometry args={[lod === "color" ? 0.46 : 1.1, lod === "color" ? 0.46 : 1.1]} />
          <meshBasicMaterial
            key={texture ? `texture-${source}` : `color-${source ?? sample.id}`}
            color={texture && !textureFailed ? "#f5f0eb" : sample.dominantColor}
            map={textureFailed ? null : texture}
            transparent
            opacity={lod === "color" ? 0.74 : 0.96}
            toneMapped={false}
          />
        </mesh>
        {selected ? (
          <mesh position={[0, 0, -0.025]} scale={1.24}>
            <ringGeometry args={[0.48, 0.53, 40]} />
            <meshBasicMaterial color="#f0d9c2" transparent opacity={0.82} toneMapped={false} />
          </mesh>
        ) : null}
      </group>
    </Billboard>
  );
}

function World({
  samples,
  islands,
  focusedId,
  selectedIds,
  quality,
  reducedMotion,
  onFocusChange,
  onToggle,
}: {
  samples: Sample[];
  islands: Island[];
  focusedId: string | null;
  selectedIds: Set<string>;
  quality: QualityLevel;
  reducedMotion: boolean;
  onFocusChange: (id: string | null) => void;
  onToggle: (id: string) => void;
}) {
  const density = quality === "high" ? samples.length : quality === "medium" ? Math.ceil(samples.length * 0.78) : Math.ceil(samples.length * 0.48);
  const visibleSamples = useMemo(() => samples.slice(0, density), [samples, density]);
  const lods = useMemo(
    () => allocateLods(visibleSamples, focusedId, quality === "high" ? 10 : quality === "medium" ? 6 : 3),
    [visibleSamples, focusedId, quality],
  );

  return (
    <>
      <fog attach="fog" args={["#08070a", 8, 19]} />
      <mesh scale={18}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#08070a" side={BackSide} />
      </mesh>
      <WorldDust count={quality === "high" ? 320 : quality === "medium" ? 240 : 150} />
      <Nebula islands={islands} radius={WORLD_RADIUS} reducedMotion={reducedMotion} />
      {visibleSamples.map((sample) => (
        <Wallpaper
          key={sample.id}
          sample={sample}
          lod={lods.get(sample.id) ?? "color"}
          focused={focusedId === sample.id}
          selected={selectedIds.has(sample.id)}
          onToggle={onToggle}
          onHover={onFocusChange}
        />
      ))}
      <ViewControls samples={visibleSamples} onFocusChange={onFocusChange} onEnter={() => focusedId && onToggle(focusedId)} reducedMotion={reducedMotion} />
    </>
  );
}

export function PlanetariumScene(props: {
  samples: Sample[];
  islands: Island[];
  focusedId: string | null;
  selectedIds: Set<string>;
  quality: QualityLevel;
  reducedMotion: boolean;
  onFocusChange: (id: string | null) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <Canvas
      aria-hidden="true"
      camera={{ position: [0, 0, 0], fov: 64, near: 0.1, far: 40 }}
      dpr={props.quality === "high" ? [1, 1.65] : 1}
      frameloop="always"
      gl={{ antialias: props.quality !== "reduced", alpha: false, powerPreference: "high-performance" }}
      performance={{ min: 0.5 }}
    >
      <World {...props} />
    </Canvas>
  );
}
