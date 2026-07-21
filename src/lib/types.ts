export type Vector3 = { x: number; y: number; z: number };

export type SampleSources = {
  sm: string;
  md: string;
  lg: string;
};

export type IslandAffinity = {
  islandId: string;
  weight: number;
};

export type Sample = {
  id: string;
  srcset: SampleSources;
  dominantColor: string;
  pos: Vector3;
  islandId: string;
  islandAffinity: IslandAffinity[];
};

export type Island = {
  id: string;
  name: string;
  centroid: Vector3;
  color: string;
};

export type PlanetariumData = {
  samples: Sample[];
  islands: Island[];
};

export type QualityLevel = "high" | "medium" | "reduced";
