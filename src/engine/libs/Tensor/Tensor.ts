import { OperationManager } from "./OperationManager";

export class Tensor {
  width: number;
  height: number;
  size: number;
  byteSize: number;
  buffer: GPUBuffer;
  opm: OperationManager;
  constructor(width: number, height: number, opm: OperationManager) {
    this.opm = opm;

    this.width = width;
    this.height = height;
    this.size = this.width * this.height;
    this.byteSize = this.size * Float32Array.BYTES_PER_ELEMENT;

    this.buffer = this.opm.createBuffer(this.size);
  }

  from(arr: Float32Array) {
    this.opm.from(this, arr);
    return this;
  }

  copy(tensor: Tensor) {
    this.opm.copy(this, tensor);
    return this;
  }

  fill(num: number = 0) {
    this.opm.fill(this, num);
    return this;
  }

  addScalar(num: number = 0) {
    this.opm.addScalar(this, num);
    return this;
  }

  subScalar(num: number = 0) {
    this.opm.subScalar(this, num);
    return this;
  }

  mulScalar(num: number = 0) {
    this.opm.mulScalar(this, num);
    return this;
  }

  divScalar(num: number = 0) {
    this.opm.divScalar(this, num);
    return this;
  }

  negative() {
    this.opm.negative(this);
    return this;
  }

  add(tensor: Tensor) {
    this.opm.add(this, tensor);
    return this;
  }

  sub(tensor: Tensor) {
    this.opm.sub(this, tensor);
    return this;
  }

  dot(tensor: Tensor) {
    this.opm.dot(this, tensor);
    return this;
  }

  div(tensor: Tensor) {
    this.opm.div(this, tensor);
    return this;
  }

  randomFloatUniform(seed: number = 0, min: number = 0, max: number = 1) {
    this.opm.randomFloatUniform(this, seed, min, max);
    return this;
  }

  randomIntUniform(seed: number = 0, min: number = 0, max: number = 1) {
    this.opm.randomIntUniform(this, seed, min, max);
    return this;
  }

  // this is the most performance inefficient function you can use in this class. only use for debugging.
  async print() {
    await this.opm.print(this);
  }
}
