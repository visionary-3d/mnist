import { Vector3 } from "../../math/Vector3";

// constants
export const OPTIMAL_WORKGROUP_SIZE = 64; // best number for workgroup size
export const MAX_WORKGROUP_DIM = 3;

const WGS = new Array<number>(MAX_WORKGROUP_DIM);
const WGS_VECTOR = new Vector3();

export const shaderMathUtils = /* wgsl */ `
// * 2D hash function
fn hash2D(p: vec2<f32>) -> vec2<f32> {
    var c = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(c) * 18.5453);
}

fn mix(a: vec3<f32>, b: vec3<f32>, cond: bool) -> vec3<f32> {
    return a * (1.0 - f32(cond)) + b * f32(cond);
}

fn mix1(a: f32, b: f32, cond: bool) -> f32 {
    return a * (1.0 - f32(cond)) + b * f32(cond);
}

fn lerp1(a: f32, b: f32, cond: f32) -> f32 {
    return a * (1.0 - cond) + b * cond;
}

fn lerp2(a: vec2<f32>, b: vec2<f32>, cond: f32) -> vec2<f32> {
    return a * (1.0 - cond) + b * cond;
}

fn lerp3(a: vec3<f32>, b: vec3<f32>, cond: f32) -> vec3<f32> {
    return a * (1.0 - cond) + b * cond;
}

fn lerp4(a: vec4<f32>, b: vec4<f32>, cond: f32) -> vec4<f32> {
    return a * (1.0 - cond) + b * cond;
}
fn is_outside_bounds(coord: vec3<u32>, bounds: vec3<f32>) -> bool {
    return coord.x >= u32(bounds.x) || coord.y >= u32(bounds.y) || coord.z >= u32(bounds.z);
}

fn dot2(v: vec2<f32>) -> f32 {
    return dot(v, v);
}

fn ndot(a: vec2<f32>, b: vec2<f32>) -> f32 {
    return a.x * b.x - a.y * b.y;
}
`;

export enum WorkGroupDimension {
  One = 1,
  Two = 2,
  Three = 3,
}

export function getWorkGroupDimensionsInShaderCode(dimNumber: WorkGroupDimension) {
  const factor = Math.pow(OPTIMAL_WORKGROUP_SIZE, 1 / dimNumber); // Calculate the root based on the dimension
  const factors: number[] = [];

  for (let i = 0; i < dimNumber; i++) {
    factors.push(factor);
  }

  return factors.join(", ");
}

export function getWorkGroupSizeVector(...dims: Array<number>) {
  // Calculate the root based on the dimension
  const factor = Math.pow(OPTIMAL_WORKGROUP_SIZE, 1 / dims.length);

  for (let i = 0; i < MAX_WORKGROUP_DIM; i++) {
    if (i < dims.length) WGS[i] = Math.ceil(dims[i] / factor);
    else WGS[i] = 1;
  }

  WGS_VECTOR.fromArray(WGS);

  return WGS_VECTOR;
}
