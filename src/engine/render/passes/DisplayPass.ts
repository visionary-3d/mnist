import Encoder from "../../Encoder";
import { Pass, Uniform, useRenderer, useResolutionUniform, useTimeUniform } from "../../init";
import { Vector2 } from "../../math/Vector2";
import displayShader from "./shaders/display.wgsl?raw";

const uResolution = useResolutionUniform();
const uImageFlatSize = new Uniform(new Vector2(28, 28));
const uSize = new Uniform(0);
const uImageIndex = new Uniform(0);
// const uAspect = useAspectRatioUniform();
const uTime = useTimeUniform();

const uniforms = {
  uResolution,
  uImageFlatSize,
  uSize,
  uImageIndex,
  uTime,
};

export class DisplayPass extends Pass {
  renderPipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  renderPassDescriptor: any;
  imagesBuffer: GPUBuffer;

  constructor(images: Float32Array, numImages: number) {
    super(useRenderer(), displayShader, uniforms);

    uniforms.uSize.set(numImages);

    const device = this.renderer.device;

    this.renderPipeline = device.createRenderPipeline({
      label: "GOOF Pipeline",
      layout: "auto",
      vertex: {
        module: device.createShaderModule({
          code: this.shader,
        }),
        entryPoint: "vert_main",
      },
      fragment: {
        module: device.createShaderModule({
          code: this.shader,
        }),
        entryPoint: "frag_main",
        targets: [
          {
            format: this.renderer.presentationFormat as GPUTextureFormat,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });
    const alignedSize = Math.ceil(images.byteLength / 4) * 4;
    // console.log(device.limits.maxStorageBufferBindingSize < alignedSize);

    this.imagesBuffer = device.createBuffer({
      label: "Images Buffer",
      size: alignedSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.imagesBuffer, 0, images.buffer);

    this.bindGroup = device.createBindGroup({
      label: "Display Bind Group",
      //   layout: this.bindGroupLayout,
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer.buffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: this.imagesBuffer,
          },
        },
      ],
    });

    this.renderPassDescriptor = {
      colorAttachments: [
        {
          view: this.renderer.context.getCurrentTexture().createView(), // Assigned later

          clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    } as any;
  }

  render(encoder: Encoder, debug: boolean = false) {
    this.renderPassDescriptor.colorAttachments[0].view = this.renderer.context.getCurrentTexture().createView();

    const passEncoder = encoder.getRenderPassEncoder("quad shader pass", this.renderPassDescriptor, debug);
    passEncoder.setPipeline(this.renderPipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.end();
  }

  update(encoder: Encoder, timestamp: number, debug: boolean = false) {
    super.update(encoder, timestamp, debug);
    this.render(encoder, debug);
  }
}
