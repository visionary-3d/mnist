import Encoder from "../../Encoder";
import { Uniform, useGpuDevice } from "../../init";
import { Vector4 } from "../../math/Vector4";
import { OPTIMAL_WORKGROUP_SIZE, WorkGroupDimension, getWorkGroupSizeVector } from "../../render/shaders/utils";
import { Operation } from "./Operation";
import { Tensor } from "./Tensor";

const shapesVector = new Vector4();
const uShapes = new Uniform(shapesVector);
const randomUniformParamsVector = new Vector4();

function setUniformTensorShape(tensor: Tensor) {
  const shapes = shapesVector.set(tensor.width, tensor.height, tensor.width, tensor.height);
  uShapes.set(shapes);
}

function setUniformTensorShapes(t1: Tensor, t2: Tensor) {
  const shapes = shapesVector.set(t1.width, t1.height, t2.width, t2.height);
  uShapes.set(shapes);
}

export class OperationManager {
  encoder: Encoder;
  fillOp: Operation;
  randomFloatUniformOp: Operation;
  divScalarOp: Operation;
  mulScalarOp: Operation;
  addScalarOp: Operation;
  subScalarOp: Operation;
  dotOp: Operation;
  randomIntUniformOp: Operation;
  addOp: Operation;
  divOp: Operation;
  subOp: Operation;
  device: GPUDevice;
  mulOp: Operation;

  constructor() {
    this.device = useGpuDevice();
    this.encoder = new Encoder(this.device);

    this.mulOp = this.create_op_mul();

    // Fill Operation: Fills the entire tensor with a single value
    this.fillOp = this.create_op_scalar("=");

    // scalar operations
    this.addScalarOp = this.create_op_scalar("+=");
    this.subScalarOp = this.create_op_scalar("-=");
    this.mulScalarOp = this.create_op_scalar("*=");
    this.divScalarOp = this.create_op_scalar("/=");

    // tensor operations
    this.addOp = this.create_op_tensor("+=");
    this.subOp = this.create_op_tensor("-=");
    this.dotOp = this.create_op_tensor("*=");
    this.divOp = this.create_op_tensor("/=");

    // uniform distribution init: fills the entire tensor with a single value
    this.randomFloatUniformOp = this.create_op_rand_uniform("f32");
    this.randomIntUniformOp = this.create_op_rand_uniform("i32");
  }

  private create_op_scalar(operation: string) {
    return new Operation(
      [],
      ["write_buffer"],
      WorkGroupDimension.One,
      /* wgsl */ `
      fn get_index(pos: vec3<u32>) -> u32 {
        return pos.x;
      }
      fn execute(pos: vec3<u32>) {
        let index = get_index(pos);
        write_buffer[index] ${operation} uniforms.params.number;
      }
      `,
      "execute",
      (tensor: Tensor, num: number = 0) => {
        // set uniforms
        setUniformTensorShape(tensor);
        return num;
      },
      (tensor: Tensor) => {
        return [
          {
            binding: 1,
            resource: {
              buffer: tensor.buffer,
            },
          },
        ];
      },
      {
        uShapes,
        uParams: new Uniform(0),
      },
      /* wgsl */ `
      struct Params {
        number: f32,
      };
      `
    );
  }

  private create_op_tensor(operation: string) {
    return new Operation(
      ["read_buffer"],
      ["write_buffer"],
      WorkGroupDimension.Two,
      /* wgsl */ `
      fn get_first_index(pos: vec3<u32>, shape: vec2<u32>) -> u32 {
        return pos.x + pos.y * shape.x;
      }
      fn get_second_index(pos: vec3<u32>, shape: vec2<u32>) -> u32 {
        return (pos.x % shape.x) + shape.x * (pos.y % shape.y);
      }
      fn execute(pos: vec3<u32>) {
        let first_index = get_first_index(pos, vec2<u32>(uniforms.shapes.xy));
        let second_index = get_second_index(pos, vec2<u32>(uniforms.shapes.wz));
        write_buffer[first_index] ${operation} read_buffer[second_index];
      }
      `,
      "execute",
      (tensor1: Tensor, tensor2: Tensor) => {
        // set uniforms

        if (tensor1.width !== tensor2.width && tensor1.height !== tensor2.height) {
          throw Error(
            "Pre-Operation Failed: Tensor shapes do not match. At least width or at least columns should be the same."
          );
        }
        setUniformTensorShapes(tensor1, tensor2);
      },
      (tensor1: Tensor, tensor2: Tensor) => {
        return [
          {
            binding: 1,
            resource: {
              buffer: tensor2.buffer,
            },
          },
          {
            binding: 2,
            resource: {
              buffer: tensor1.buffer,
            },
          },
        ];
      },
      {
        uShapes,
      }
    );
  }

  private create_op_mul() {
    return new Operation(
      ["read_buffer_a", "read_buffer_b"],
      ["write_buffer"],
      WorkGroupDimension.Two,
      /* wgsl */ `
      fn execute(pos: vec3<u32>) {
        let col = pos.x;
        let row = pos.y;

        let width = u32(uniforms.shapes.x);
        let height = u32(uniforms.shapes.y);

        var sum = 0.0;
        for (var k: u32 = 0; k < width; k++) {
          let index_a = row * width + k;
          let index_b = k * height + col;
          sum += read_buffer_a[index_a] * read_buffer_b[index_b];
        }

        let index = row * height + col;
        write_buffer[index] = sum;
      }
    `,
      "execute",
      (tensorA: Tensor, tensorB: Tensor, tensorC: Tensor) => {
        // set uniforms

        if (tensorA.width !== tensorB.height) {
          throw Error(
            "Pre-Operation Failed: Matrix multiplication requires the number of columns in the first matrix to match the number of rows in the second matrix."
          );
        }

        setUniformTensorShape(tensorC);
      },
      (tensorA: Tensor, tensorB: Tensor, tensorC: Tensor) => {
        return [
          {
            binding: 1,
            resource: {
              buffer: tensorA.buffer,
            },
          },
          {
            binding: 2,
            resource: {
              buffer: tensorB.buffer,
            },
          },
          {
            binding: 3,
            resource: {
              buffer: tensorC.buffer,
            },
          },
        ];
      },
      {
        uShapes,
      }
    );
  }

  private create_op_rand_uniform(cast: string = "") {
    return new Operation(
      [],
      ["write_buffer"],
      WorkGroupDimension.One,
      /* wgsl */ `
      fn hash(value: u32) -> u32 {
          var x = value;
          x ^= x >> 16;
          x *= 0x85ebca6bu;
          x ^= x >> 13;
          x *= 0xc2b2ae35u;
          x ^= x >> 16;
          return x;
      }

      fn random_between(min: f32, max: f32, seed: u32, index: u32) -> f32 {
          // Combine seed and index, and hash the result to scramble it
          let combined_seed = hash(seed ^ index);
          
          // Generate a pseudo-random number between 0 and 1
          let random_value = f32(combined_seed) / f32(0xFFFFFFFFu);
          
          // Scale the random value to the range [min, max]
          let scaled_value = min + random_value * (max - min);
          
          return scaled_value;
      }
      fn random_uniform(pos: vec3<u32>) {
          let index = pos.x;

          let output = ${cast}(random_between(uniforms.params.min,
                                                           uniforms.params.max,
                                                           u32(uniforms.params.seed),
                                                           index));

          // convert back to float
          write_buffer[index] = f32(output);
      }
      `,
      "random_uniform",
      (tensor: Tensor, seed: number, min: number, max: number) => {
        // set uniforms
        setUniformTensorShape(tensor);

        return randomUniformParamsVector.set(seed, min, max, 0);
      },
      (tensor: Tensor) => {
        return [
          {
            binding: 1,
            resource: {
              buffer: tensor.buffer,
            },
          },
        ];
      },
      {
        uShapes,

        uParams: new Uniform(randomUniformParamsVector),
      },
      /* wgsl */ `
      struct Params {
        seed: f32,
        min: f32,
        max: f32,
        nothing: f32,
      };
      `
    );
  }
  private submitCommands() {
    this.encoder.submit();
  }

  private compute_op_scalar(op: Operation, tensor: Tensor, num: number = 0) {
    const wgs = getWorkGroupSizeVector(tensor.width * tensor.height);

    const params = op.preCompute(tensor, num);
    op.paramsUniform?.set(params);

    op.compute(this.encoder, op.createBindGroup(tensor), wgs, true);

    this.submitCommands();
  }

  private compute_op_tensor(op: Operation, tensor1: Tensor, tensor2: Tensor) {
    const wgs = getWorkGroupSizeVector(tensor1.width, tensor1.height);

    op.preCompute(tensor1, tensor2);

    op.compute(this.encoder, op.createBindGroup(tensor1, tensor2), wgs, true);

    this.submitCommands();
  }

  private compute_op_mul(op: Operation, tensorA: Tensor, tensorB: Tensor, tensorC: Tensor) {
    const wgs = getWorkGroupSizeVector(tensorC.width, tensorC.height);

    op.preCompute(tensorA, tensorB, tensorC);

    op.compute(this.encoder, op.createBindGroup(tensorA, tensorB, tensorC), wgs, true);

    this.submitCommands();
  }

  private compute_rand_uniform_op(op: Operation, tensor: Tensor, seed: number = 0, min: number = 0, max: number = 1) {
    const wgs = getWorkGroupSizeVector(tensor.width * tensor.height);

    const params = op.preCompute(tensor, seed, min, max);
    op.paramsUniform?.set(params);

    op.compute(this.encoder, op.createBindGroup(tensor), wgs, true);

    this.submitCommands();
  }

  createBuffer(size: number) {
    const roundedSize = Math.ceil(size / OPTIMAL_WORKGROUP_SIZE) * OPTIMAL_WORKGROUP_SIZE;
    const bufferSize = roundedSize * Float32Array.BYTES_PER_ELEMENT;

    if (bufferSize > this.device.limits.maxBufferSize || bufferSize > this.device.limits.maxStorageBufferBindingSize) {
      throw Error("Tensor Creation: Failed to allocate buffer, because the buffer size is too big.");
    }

    return this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE,
    });
  }

  copy(dst: Tensor, src: Tensor) {
    const ce = this.encoder.getCommandEncoder();
    ce.copyBufferToBuffer(src.buffer, 0, dst.buffer, 0, src.byteSize);

    this.submitCommands();
  }

  create(width: number, height: number) {
    return new Tensor(width, height, this);
  }

  zeros(width: number, height: number) {
    return new Tensor(width, height, this);
  }

  ones(width: number, height: number) {
    return new Tensor(width, height, this).fill(1);
  }

  clone(tensor: Tensor) {
    return new Tensor(tensor.width, tensor.height, this).copy(tensor);
  }

  from(tensor: Tensor, arr: Float32Array) {
    this.device.queue.writeBuffer(tensor.buffer, 0, arr.buffer);
  }

  mul(tensorA: Tensor, tensorB: Tensor, tensorC: Tensor) {
    this.compute_op_mul(this.mulOp, tensorA, tensorB, tensorC);
  }

  fill(tensor: Tensor, num: number = 0) {
    this.compute_op_scalar(this.fillOp, tensor, num);
  }

  addScalar(tensor: Tensor, num: number = 0) {
    this.compute_op_scalar(this.addScalarOp, tensor, num);
  }

  subScalar(tensor: Tensor, num: number = 0) {
    this.compute_op_scalar(this.subScalarOp, tensor, num);
  }

  mulScalar(tensor: Tensor, num: number = 0) {
    this.compute_op_scalar(this.mulScalarOp, tensor, num);
  }

  divScalar(tensor: Tensor, num: number = 0) {
    this.compute_op_scalar(this.divScalarOp, tensor, num);
  }

  negative(tensor: Tensor) {
    this.compute_op_scalar(this.mulScalarOp, tensor, -1);
  }

  add(tensor1: Tensor, tensor2: Tensor) {
    this.compute_op_tensor(this.addOp, tensor1, tensor2);
  }

  sub(tensor1: Tensor, tensor2: Tensor) {
    this.compute_op_tensor(this.subOp, tensor1, tensor2);
  }

  dot(tensor1: Tensor, tensor2: Tensor) {
    this.compute_op_tensor(this.dotOp, tensor1, tensor2);
  }

  div(tensor1: Tensor, tensor2: Tensor) {
    this.compute_op_tensor(this.divOp, tensor1, tensor2);
  }

  randomFloatUniform(tensor: Tensor, seed: number = 0, min: number = 0, max: number = 1) {
    this.compute_rand_uniform_op(this.randomFloatUniformOp, tensor, seed, min, max);
  }

  randomIntUniform(tensor: Tensor, seed: number = 0, min: number = 0, max: number = 1) {
    this.compute_rand_uniform_op(this.randomIntUniformOp, tensor, seed, min, max);
  }

  async print(tensor: Tensor) {
    const data = await this.readBuffer(tensor.buffer, tensor.byteSize);
    console.log(data);
  }

  async readBuffer(buffer: GPUBuffer, byteSize: number) {
    // create staging buffer
    const readBuffer = this.device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = new Encoder(this.device);
    const ce = encoder.getCommandEncoder();
    ce.copyBufferToBuffer(buffer, 0, readBuffer, 0, byteSize);
    encoder.submit();
    await readBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = readBuffer.getMappedRange();
    return new Float32Array(arrayBuffer);
  }
}
