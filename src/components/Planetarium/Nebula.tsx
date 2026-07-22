"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, Group } from "three";
import type { Island } from "@/lib/types";
import { toSpherePosition } from "./sceneMath";

export function createNebulaLayers(islands: Island[], radius: number) {
  return islands.map((island) => ({
    id: island.id,
    color: island.color,
    position: toSpherePosition(island.centroid, radius),
  }));
}

export function Nebula({ islands, radius, reducedMotion = false }: { islands: Island[]; radius: number; reducedMotion?: boolean }) {
  const group = useRef<Group>(null);
  const layers = createNebulaLayers(islands, radius * 0.93);
  const glow = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.88)");
      gradient.addColorStop(0.18, "rgba(255, 255, 255, 0.34)");
      gradient.addColorStop(0.52, "rgba(255, 255, 255, 0.08)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => glow.dispose(), [glow]);
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 0.32) * 0.035;
    group.current.scale.setScalar(pulse);
  });
  return (
    <group ref={group}>
      {layers.map((layer, index) => (
        <group key={layer.id} position={layer.position}>
          <sprite scale={3.8 + (index % 3) * 0.48}>
            <spriteMaterial
              map={glow}
              color={layer.color}
              transparent
              opacity={0.26}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </sprite>
          <Html center distanceFactor={3.2} className="island-name" transform sprite>
            {islands[index].name}
          </Html>
        </group>
      ))}
    </group>
  );
}
