import Encoder from "../../Encoder";
import { Uniform, UniformBuffer, UniformList, useGpuDevice } from "../../init";
import { Vector3 } from "../../math/Vector3";
import { WorkGroupDimension, getWorkGroupDimensionsInShaderCode } from "../../render/shaders/utils";

export class Operation {
  device: GPUDevice;
  layout: GPUBindGroupLayout;
  shader: string;
  pipeline: GPUComputePipeline;
  uniformBuffer: UniformBuffer;
  numDims: WorkGroupDimension;
  preCompute: Function;
  createBindGroup: Function;
  paramsUniform?: Uniform<any>;
  constructor(
    readBufferNames: string[],
    writeBufferNames: string[],
    numDims: WorkGroupDimension,
    fnDef: string,
    fnEntryPoint: string,
    preCompute: Function,
    createBindGroup: Function,
    uniforms: UniformList<any>,
    paramUniformDef?: string
  ) {
    this.device = useGpuDevice();
    this.numDims = numDims;
    this.preCompute = preCompute;
    this.createBindGroup = createBindGroup;
    this.paramsUniform = uniforms.uParams;
    this.uniformBuffer = new UniformBuffer(this.device, uniforms);
    this.layout = this.initLayout(readBufferNames.length, writeBufferNames.length);
    this.shader = this.generateShaderCode(readBufferNames, writeBufferNames, fnDef, fnEntryPoint, paramUniformDef);
    this.pipeline = this.initPipeline();
  }

  private generateBindingsShaderCode(readBufferNames: string[], writeBufferNames: string[]) {
    let bindings = "\n";
    let bIndex = 1;

    for (let i = 0; i < readBufferNames.length; i++) {
      const name = readBufferNames[i];
      bindings += /* wgsl */ `@group(0) @binding(${bIndex}) var<storage, read> ${name}: array<f32>;`;
      bIndex++;
    }

    for (let i = 0; i < writeBufferNames.length; i++) {
      const name = writeBufferNames[i];
      bindings += /* wgsl */ `@group(0) @binding(${bIndex}) var<storage, read_write> ${name}: array<f32>;`;
      bIndex++;
    }

    return bindings;
  }

  generateShaderCode(
    readBufferNames: string[],
    writeBufferNames: string[],
    fnDef: string,
    fnEntryPoint: string,
    paramUniformDef?: string
  ) {
    const bindings = this.generateBindingsShaderCode(readBufferNames, writeBufferNames);
    // const getIndexFunction = this.generateGetIndexFunctionShaderCode();

    const hasParams = paramUniformDef !== undefined;

    return /* wgsl */ `
      ${hasParams ? paramUniformDef : ""}

      struct Uniforms {
        shapes: vec4<f32>,
        ${hasParams ? /* wgsl */ `params: Params` : ""}
      };

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      ${bindings}

      // insert main function code
      ${fnDef}

      @compute @workgroup_size(${getWorkGroupDimensionsInShaderCode(this.numDims)}) // 64
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        ${fnEntryPoint}(global_id);
      }
    `;
  }

  initLayout(reads: number, writes: number) {
    const des = {
      entries: [] as GPUBindGroupLayoutEntry[],
    };

    // The first binding is the uniform buffer
    des.entries.push({
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: "uniform",
      },
    } as GPUBindGroupLayoutEntry);

    let binding = 1;

    for (let i = 0; i < reads; i++) {
      des.entries.push({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
        },
      } as GPUBindGroupLayoutEntry);

      binding++;
    }

    for (let i = 0; i < writes; i++) {
      des.entries.push({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      } as GPUBindGroupLayoutEntry);

      binding++;
    }

    const bindGroupLayout = this.device.createBindGroupLayout(des as GPUBindGroupLayoutDescriptor);

    return bindGroupLayout;
  }

  initPipeline() {
    const shaderModule = this.device.createShaderModule({
      code: this.shader,
    });

    const computePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.layout],
      }),
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    return computePipeline;
  }

  compute(encoder: Encoder, bindGroupEntries: GPUBindGroupEntry[], wgs: Vector3, debug: boolean = false) {
    this.uniformBuffer.updateUniformBuffer();

    const passEncoder = encoder.getComputePassEncoder("raytracing", debug);

    const bindGroup = this.device.createBindGroup({
      layout: this.layout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer.buffer,
          },
        },
        ...bindGroupEntries,
      ],
    }) as GPUBindGroup;

    // Compute Pass
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);

    // Dispatch
    passEncoder.dispatchWorkgroups(wgs.x, wgs.y, wgs.z);

    passEncoder.end();
  }
}
