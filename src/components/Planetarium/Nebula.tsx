"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { AdditiveBlending, Group } from "three";
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
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 0.32) * 0.035;
    group.current.scale.setScalar(pulse);
  });
  return (
    <group ref={group}>
      {layers.map((layer, index) => (
        <group key={layer.id} position={layer.position}>
          <mesh scale={1.7 + (index % 3) * 0.22}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial
              color={layer.color}
              transparent
              opacity={0.075}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
          <Html center distanceFactor={13} className="island-name" transform sprite>
            {islands[index].name}
          </Html>
        </group>
      ))}
    </group>
  );
}
