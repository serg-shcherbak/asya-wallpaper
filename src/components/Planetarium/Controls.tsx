"use client";

/* eslint-disable react-hooks/immutability -- R3F frame callbacks mutate Three.js camera objects by design. */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Euler, Vector3 as ThreeVector3 } from "three";
import type { Sample } from "@/lib/types";

const PITCH_LIMIT = (70 * Math.PI) / 180;

export const clampPitch = (value: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, value));
export const clampFov = (value: number) => Math.max(35, Math.min(82, value));
export const wrapYaw = (value: number) => {
  const circle = Math.PI * 2;
  return ((value + Math.PI) % circle + circle) % circle - Math.PI;
};
export const applyDamping = (value: number, factor: number) => {
  const next = value * factor;
  return Math.abs(next) < 0.0001 ? 0 : next;
};

type Intent = { yaw: number; pitch: number; zoom: number };

const INTERACTIVE_TARGET_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
].join(",");

export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_TARGET_SELECTOR) !== null;
}

export function keyIntent(key: string): Intent | null {
  const normalized = key.toLowerCase();
  if (normalized === "arrowleft" || normalized === "a") return { yaw: 1, pitch: 0, zoom: 0 };
  if (normalized === "arrowright" || normalized === "d") return { yaw: -1, pitch: 0, zoom: 0 };
  if (normalized === "arrowup" || normalized === "w") return { yaw: 0, pitch: 1, zoom: 0 };
  if (normalized === "arrowdown" || normalized === "s") return { yaw: 0, pitch: -1, zoom: 0 };
  if (normalized === "+" || normalized === "=") return { yaw: 0, pitch: 0, zoom: -1 };
  if (normalized === "-" || normalized === "_") return { yaw: 0, pitch: 0, zoom: 1 };
  return null;
}

type HintState = { active: boolean; consumed: boolean };
export const consumeFirstRunHint = (state: HintState): HintState =>
  state.consumed ? state : { active: false, consumed: true };

type ViewControlsProps = {
  samples: Sample[];
  onFocusChange: (sampleId: string | null) => void;
  onEnter: () => void;
  reducedMotion?: boolean;
};

export function getInitialViewAngles(samples: Sample[]) {
  if (samples.length === 0) return { yaw: 0, pitch: 0 };

  const groups = new Map<string, Sample[]>();
  for (const sample of samples) {
    const group = groups.get(sample.islandId) ?? [];
    group.push(sample);
    groups.set(sample.islandId, group);
  }
  const largestGroup = [...groups.entries()].sort(
    ([leftId, left], [rightId, right]) => right.length - left.length || leftId.localeCompare(rightId),
  )[0]?.[1] ?? [samples[0]];
  const direction = largestGroup.reduce(
    (total, sample) => total.add(new ThreeVector3(sample.pos.x, sample.pos.y, sample.pos.z)),
    new ThreeVector3(),
  );
  if (direction.lengthSq() < 0.000001) {
    direction.set(samples[0].pos.x, samples[0].pos.y, samples[0].pos.z);
  }
  direction.normalize();
  return {
    yaw: Math.atan2(-direction.x, -direction.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, direction.y))),
  };
}

export function ViewControls({ samples, onFocusChange, onEnter, reducedMotion = false }: ViewControlsProps) {
  const { camera, gl } = useThree();
  const initialView = useMemo(() => getInitialViewAngles(samples), [samples]);
  const yaw = useRef(initialView.yaw);
  const pitch = useRef(initialView.pitch);
  const fov = useRef(64);
  const velocity = useRef({ yaw: 0, pitch: 0 });
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const hint = useRef<HintState>({ active: !reducedMotion, consumed: reducedMotion });
  const focused = useRef<string | null>(null);
  const direction = useRef(new ThreeVector3());
  const rotation = useRef(new Euler(0, 0, 0, "YXZ"));

  const consumeHint = () => {
    hint.current = consumeFirstRunHint(hint.current);
  };

  useEffect(() => {
    const element = gl.domElement;
    const onPointerDown = (event: PointerEvent) => {
      pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      element.setPointerCapture?.(event.pointerId);
      consumeHint();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointer.current || pointer.current.id !== event.pointerId) return;
      const deltaX = event.movementX;
      const deltaY = event.movementY;
      velocity.current.yaw = -deltaX * 0.0022;
      velocity.current.pitch = -deltaY * 0.0022;
      yaw.current += velocity.current.yaw;
      pitch.current = clampPitch(pitch.current + velocity.current.pitch);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pointer.current?.id === event.pointerId) pointer.current = null;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      consumeHint();
      fov.current = clampFov(fov.current + Math.sign(event.deltaY) * 3);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        if (isInteractiveTarget(event.target)) return;
        onEnter();
        consumeHint();
        return;
      }
      const intent = keyIntent(event.key);
      if (!intent) return;
      event.preventDefault();
      consumeHint();
      yaw.current += intent.yaw * 0.08;
      pitch.current = clampPitch(pitch.current + intent.pitch * 0.06);
      fov.current = clampFov(fov.current + intent.zoom * 3);
    };
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerUp);
    element.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerUp);
      element.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [gl, onEnter]);

  useFrame((state, delta) => {
    if (!pointer.current) {
      velocity.current.yaw = applyDamping(velocity.current.yaw, Math.pow(0.04, delta));
      velocity.current.pitch = applyDamping(velocity.current.pitch, Math.pow(0.04, delta));
      yaw.current += velocity.current.yaw;
      pitch.current = clampPitch(pitch.current + velocity.current.pitch);
      const drift = hint.current.active ? 0.045 : reducedMotion ? 0 : 0.004;
      yaw.current += drift * delta;
    }
    yaw.current = wrapYaw(yaw.current);
    rotation.current.set(pitch.current, yaw.current, 0);
    camera.quaternion.setFromEuler(rotation.current);
    if ("fov" in camera && camera.fov !== fov.current) {
      camera.fov = fov.current;
      camera.updateProjectionMatrix();
    }
    camera.getWorldDirection(direction.current);
    let next: string | null = null;
    let best = 0.72;
    for (const sample of samples) {
      const length = Math.hypot(sample.pos.x, sample.pos.y, sample.pos.z) || 1;
      const score =
        (sample.pos.x * direction.current.x +
          sample.pos.y * direction.current.y +
          sample.pos.z * direction.current.z) /
        length;
      if (score > best) {
        best = score;
        next = sample.id;
      }
    }
    if (next !== focused.current) {
      focused.current = next;
      onFocusChange(next);
    }
    state.invalidate();
  });

  return null;
}
