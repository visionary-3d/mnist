import Stats from "./libs/Stats.js";

import { PerspectiveCamera } from "./math/Camera.js";
import { Quaternion } from "./math/Quaternion.js";
import { Vector2 } from "./math/Vector2.js";
import { Vector3 } from "./math/Vector3.js";
import { Vector4 } from "./math/Vector4.js";
import TickManager from "./render/controllers/tick-manager.js";

import { initDebugInfo, useDebug } from "./debug/debug.js";
import Encoder from "./Encoder.js";

// @ts-ignore
import { GUI } from "./libs/lil-gui.module.min.js";

import { CameraStruct } from "./render/utils/structs.js";

type WindowSize = { width: number; height: number };
type WindowResizeFunction = (width: number, height: number) => void;

let stats: Stats,
  statsList: Stats[] = [],
  navigator: Navigator,
  adapter: GPUAdapter | null,
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  context: GPUCanvasContext | null,
  renderer: Renderer,
  camera: PerspectiveCamera = new PerspectiveCamera(75, 0, 0.1, 1000),
  resizeFunctions: WindowResizeFunction[] = [],
  gui: GUI,
  windowSize: WindowSize = { width: 0, height: 0 },
  renderTickManager: TickManager;

// Pad to 16 byte chunks of 2, 4 (std140 layout)
const pad2 = (n: number) => n + (n % 2);
const pad4 = (n: number) => n + ((4 - (n % 4)) % 4);

// convert nested objects into a single array using index without of array.push
const recursiveObjectToArray = (obj: any, array: Array<number>, index: number = 0) => {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = obj[key];
    if (value instanceof Object) {
      index = recursiveObjectToArray(value, array, index);
    } else if (value instanceof Array) {
      for (let j = 0; j < value.length; j++) {
        array[index++] = value[j];
      }
    } else {
      array[index++] = value;
    }
  }
  return index;
};

type UniformPrimitive<T> = T[] | Uniform<T> | Vector4 | Vector3 | Vector2 | T;
type UniformReference<T> = UniformPrimitive<T> | Object;

export type UniformList<T> = Record<string, Uniform<T>>;

export class Uniform<T> {
  value: UniformReference<T>;
  readonly array: T[] | number[] | Float32Array;
  extraPadding: number;

  constructor(input: UniformReference<T>) {
    this.value = input;
    this.extraPadding = 0;

    if (input instanceof Uniform) {
      this.array = new Array(input.array.length);
      this.copy(input);
    } else if (input instanceof Array) {
      this.array = new Array<T>(input.length);
      for (let i = 0; i < input.length; i++) {
        this.array[i] = input[i];
      }
    } else if (input instanceof Vector2) {
      const arr = new Array<number>(2).fill(0);
      this.array = input.toArray(arr);
    } else if (input instanceof Vector4 || input instanceof Vector3) {
      // we consider vec3 to be vec4 cause it's easier to handle
      const arr = new Array<number>(4).fill(0);
      this.array = input.toArray(arr);
    } else if (input instanceof Quaternion) {
      const arr = new Array<number>(4).fill(0);
      this.array = input.toArray(arr);
    } else if (input instanceof Object) {
      const values = Object.values(input);
      const keys = Object.keys(input);
      const list = {} as UniformList<T>;
      for (let i = 0; i < values.length; i++) {
        list[keys[i]] = new Uniform(values[i]);
      }
      this.value = list;
      this.array = [];
    } else {
      this.array = [input];
    }
  }

  set(value: UniformReference<T>) {
    this.value = value;
  }

  copy(u: Uniform<T>) {
    this.value = u.value;

    for (let i = 0; i < this.array.length; i++) {
      this.array[i] = u.array[i];
    }
  }

  update() {
    // copy reference into value

    if (this.value instanceof Uniform) {
      this.copy(this.value);
      return this.array;
    } else if (this.value instanceof Array) {
      for (let i = 0; i < this.value.length; i++) {
        this.array[i] = this.value[i];
      }
      return this.array;
    } else if (
      this.value instanceof Vector2 ||
      this.value instanceof Vector3 ||
      this.value instanceof Vector4 ||
      this.value instanceof Quaternion
    ) {
      this.value.toArray(this.array as number[]);
      return this.array;
    } else if (this.value instanceof Object) {
      // nothing, because the object is flattened
      // and the references to the uniforms have changed
      // so the update happens at the individual uniforms
      return this.array;
    } else {
      this.array[0] = this.value;
      return this.array;
    }
  }
}

export class Renderer {
  context: GPUCanvasContext;
  device: GPUDevice;
  presentationFormat: GPUTextureFormat;
  width: number;
  height: number;

  constructor(
    context: GPUCanvasContext,
    device: GPUDevice,
    width: number,
    height: number,
    presentationFormat: GPUTextureFormat
  ) {
    this.context = context;
    this.presentationFormat = presentationFormat;
    this.device = device;
    this.width = width;
    this.height = height;
  }
}

type UniformSize = { number: number };
const calculateUniformSizeRecursive = (uniform: Uniform<any>, size: UniformSize) => {
  const elements = Object.values(uniform.value);
  if (elements[0] instanceof Uniform) {
    const values = Object.values(uniform.value);
    for (let i = 0; i < values.length; i++) {
      const val = values[i] as Uniform<any>;
      calculateUniformSizeRecursive(val, size);
    }
  } else {
    size.number += uniform.array.length;
  }

  return size.number;
};

const flattenUniforms = (uniforms: UniformList<any>, list: UniformList<any> = {}, keyword?: string) => {
  const values = Object.values(uniforms);
  const keys = Object.keys(uniforms);

  for (let i = 0; i < values.length; i++) {
    const u = values[i];
    const uniforms = Object.values(u.value) as Uniform<any>[];
    if (uniforms[0] instanceof Uniform) {
      flattenUniforms(u.value, list, keys[i] + ".");
      const size = calculateUniformSizeRecursive(u, { number: 0 });
      uniforms[uniforms.length - 1].extraPadding = pad4(size) - size;
    } else {
      let name = keys[i];
      if (keyword) {
        name = keyword + name;
      }
      list[name] = u;
    }
  }

  return list;
};

// * This class is inspired by: https://github.com/CodyJasonBennett/four
export class UniformBuffer {
  uniformsArray: Float32Array;
  buffer: GPUBuffer;
  uniforms: UniformList<any>;
  offsets: Float32Array;
  count: number;
  device: GPUDevice;

  constructor(device: GPUDevice, uniforms: UniformList<any>) {
    this.device = device;
    this.uniforms = flattenUniforms(uniforms);
    this.count = this.getUniformBufferElementsCount();
    this.uniformsArray = new Float32Array(this.count);
    this.offsets = this.initOffsets();
    this.buffer = this.initUniformBuffer();
  }

  initUniformBuffer() {
    const uniformBuffer = this.device.createBuffer({
      size: this.uniformsArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    return uniformBuffer;
  }

  getUniformBufferElementsCount = () => {
    const uniforms = Object.values(this.uniforms);

    let size = 0;
    for (let i = 0; i < uniforms.length; i++) {
      const u = uniforms[i];
      const value = u.array;
      if (value.length == 1) {
        size += 1;
      } else {
        const pad = value.length == 2 ? pad2 : pad4;
        size = pad(size) + pad(value.length);
      }

      size += u.extraPadding;
    }

    return pad4(size);
  };

  initOffsets = () => {
    const offsets = new Float32Array(Object.keys(this.uniforms).length);
    const values = Object.values(this.uniforms);

    let offset = 0;
    for (let i = 0; i < values.length; i++) {
      const u = values[i];
      const value = u.array;

      offsets[i] = offset;

      if (value.length == 1) {
        offset++;
      } else {
        const pad = value.length <= 2 ? pad2 : pad4;
        offsets[i] = pad(offset);
        offset = pad(offset) + pad(value.length);
      }

      offset += u.extraPadding;
    }

    return offsets;
  };

  updateUniformBuffer = () => {
    const uniforms = Object.values(this.uniforms);

    // Pack buffer
    for (let i = 0; i < uniforms.length; i++) {
      const u = uniforms[i];
      const offset = this.offsets[i];

      u.update();

      const value = u.array;

      if (value.length == 1) {
        this.uniformsArray[offset] = value[0];
      } else {
        this.uniformsArray.set(value, offset);
      }
    }

    this.device.queue.writeBuffer(this.buffer, 0, this.uniformsArray.buffer);
  };
}

export class Pass {
  renderer: Renderer;
  shader: string;
  uniformBuffer: UniformBuffer;
  uniforms: UniformList<any>;

  constructor(renderer: Renderer, shader: string, uniforms: UniformList<any>) {
    this.renderer = renderer;
    this.shader = shader;
    this.uniforms = uniforms;
    this.uniformBuffer = new UniformBuffer(renderer.device, uniforms);
  }

  update(encoder: Encoder, timestamp: number, debug: boolean = false) {
    this.uniformBuffer.updateUniformBuffer();
  }
}

// uniforms
const resolutionVec2 = new Vector2();
const uResolution = new Uniform(resolutionVec2);
const uAspectRatio = new Uniform(0);
const uTime = new Uniform(0);
const cameraStruct = new CameraStruct(camera);
const uCamera = new Uniform(cameraStruct);

export const initEngine = async () => {
  const DEBUG = useDebug();
  initDebugInfo();

  stats = new Stats("App");

  navigator = window.navigator as any;
  if (!navigator.gpu) throw new Error("WebGPU not supported, falling back to WebGL");

  adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No adapter found");

  device = (await adapter.requestDevice({
    requiredFeatures: ["timestamp-query"],
  })) as GPUDevice;
  canvas = document.getElementById("canvas") as HTMLCanvasElement;

  if (!canvas) throw new Error("No canvas found");

  context = canvas.getContext("webgpu");

  const setCanvasSize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    renderer.width = width;
    renderer.height = height;

    for (const f of resizeFunctions) {
      f(width, height);
    }
  };

  const canvasWidth = canvas.clientWidth;
  const canvasHeight = canvas.clientHeight;

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  if (!context) throw new Error("No context found");

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "opaque",
    usage:
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING,
  });

  renderer = new Renderer(context, device, canvasWidth, canvasHeight, presentationFormat);

  if (DEBUG) {
    gui = new GUI({ width: 500 });
  }

  window.addEventListener("resize", () => {
    setCanvasSize();
  });

  setCanvasSize();

  // fix camera
  camera.aspectRatio = renderer.width / renderer.height;

  camera.position.x = 0.5;
  camera.position.y = 0.7;
  camera.position.z = -1.3;
  // camera.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI);
  // camera.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2);
  camera.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  // camera.quaternion.set(0.0275, -0.9296, -0.07108, -0.3604);

  renderTickManager = new TickManager();
  renderTickManager.startLoop();

  const updateUniforms = (width: number, height: number) => {
    uResolution.set(resolutionVec2.set(width, height));
    uAspectRatio.set(width / height);
  };

  resizeFunctions.push((width: number, height: number) => {
    updateUniforms(width, height);
  });

  updateUniforms(renderer.width, renderer.height);
};

class NoGui {
  constructor() {}

  add() {
    return this;
  }

  min() {
    return this;
  }

  max() {
    return this;
  }

  name() {
    return this;
  }

  onChange() {
    return this;
  }

  addFolder() {
    return this;
  }
}

const NO_GUI = new NoGui();

export const useRenderer = () => renderer;
export const useCamera = () => camera;
export const useCanvas = () => canvas;
export const useGpuDevice = () => device;
export const useGpuAdapter = () => adapter;
export const useCanvasContext = () => context;
export const useStats = () => stats;
export const useStatsList = () => statsList;
export const useResize = (f: WindowResizeFunction) => resizeFunctions.push(f);
export const useGui = () => {
  const DEBUG = useDebug();

  if (DEBUG) {
    return gui;
  } else {
    return NO_GUI;
  }
};
export const useTick = (fn: Function) => {
  if (renderTickManager) {
    const _tick = (e: any) => {
      fn(e.data);
    };
    renderTickManager.addEventListener("tick", _tick);
  }
};
export const useRendererSize = () => {
  windowSize.width = renderer.width;
  windowSize.height = renderer.height;
  return windowSize;
};

export const useTimeUniform = () => uTime;
export const useCameraUniform = () => uCamera;
export const useResolutionUniform = () => uResolution;
export const useAspectRatioUniform = () => uAspectRatio;
