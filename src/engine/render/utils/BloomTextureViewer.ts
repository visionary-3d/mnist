// WebGPU Texture Viewer
// provide GPUTexture as the input and render it to a small canvas in the corner

import { Renderer, UniformBuffer, UniformList, useGui } from "../../init";

const TEXTURE_DIVIDER = 4;

const commandBufferArray = new Array<GPUCommandBuffer>(1);
const submitCommandBuffer = (device: GPUDevice, commandEncoder: GPUCommandEncoder) => {
  commandBufferArray[0] = commandEncoder.finish();

  device.queue.submit(commandBufferArray);
};

const getTextureMipMultiplier = (textureName: string) => {
  switch (textureName) {
    case "prefilter": {
      return 1;
    }
    case "ping": {
      return 2;
    }
    case "pong": {
      return 1;
    }
    case "down": {
      return 2;
    }
    default: {
      return 1;
    }
  }
};

const guiControls = {
  mipLevel: 0,
  mipLevelControl: {},
  textureHasChanged: false,
  texture: "pong",
  enabled: true,
};

class BloomTextureViewer {
  canvas: HTMLCanvasElement;
  context: any;
  device: GPUDevice;
  //   texture: GPUTexture;
  renderPassDescriptor: GPURenderPassDescriptor;
  sampler: GPUSampler;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  pipeline: GPURenderPipeline;
  prefilterTexture: GPUTexture;
  ping: GPUTexture;
  pong: GPUTexture;
  downsampleTexture: GPUTexture;
  uniformBuffer: UniformBuffer;
  gui: any;
  constructor(
    renderer: Renderer,
    uniforms: UniformList<any>,
    prefilterTexture: GPUTexture,
    ping: GPUTexture,
    pong: GPUTexture,
    downsampleTexture: GPUTexture
  ) {
    this.device = renderer.device;

    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.floor(ping.width / TEXTURE_DIVIDER);
    this.canvas.height = Math.floor(ping.height / TEXTURE_DIVIDER);

    this.uniformBuffer = new UniformBuffer(this.device, uniforms);

    // style, render on top
    this.canvas.style.position = "absolute";
    this.canvas.style.bottom = "0px";
    this.canvas.style.left = "0px";

    document.body.appendChild(this.canvas);
    this.context = this.canvas.getContext("webgpu");
    this.context.configure({
      device: this.device,
      format: "rgba16float" as GPUTextureFormat,
      alphaMode: "opaque",
      usage:
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING,
    });

    this.prefilterTexture = prefilterTexture;
    this.ping = ping;
    this.pong = pong;
    this.downsampleTexture = downsampleTexture;
    // this.texture = this.initTexture(texture);

    this.sampler = this.device.createSampler({
      label: "sampler texture viewer",
      addressModeU: "repeat",
      addressModeV: "repeat",
      addressModeW: "repeat",
      magFilter: "linear",
      minFilter: "linear",
      // mipmapFilter: 'linear',
    });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: "uniform",
          },
        },
        {
          binding: 1,
          texture: {
            sampleType: "float",
          },
          visibility: GPUShaderStage.FRAGMENT,
        },
        {
          binding: 2,
          sampler: {
            type: "filtering",
          },
          visibility: GPUShaderStage.FRAGMENT,
        },
      ],
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer.buffer,
          },
        },
        {
          binding: 1,
          resource: ping.createView(),
        },
        {
          binding: 2,
          resource: this.sampler,
        },
      ],
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: {
        module: this.device.createShaderModule({
          code: /* wgsl */ `
            struct VertexOutput {
                @builtin(position) Position: vec4<f32>,
            };

            @vertex
            fn vert_main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
                var pos = array<vec2<f32>, 6> (
                    vec2<f32>(-1.0, -1.0),
                    vec2<f32>(1.0, -1.0),
                    vec2<f32>(1.0, 1.0),
                    vec2<f32>(-1.0, -1.0),
                    vec2<f32>(-1.0, 1.0),
                    vec2<f32>(1.0, 1.0)
                );

                var output: VertexOutput;
                output.Position = vec4<f32> (pos[VertexIndex], 0.0, 1.0);
                return output;
            }
            `,
        }),
        entryPoint: "vert_main",
      },
      fragment: {
        module: this.device.createShaderModule({
          code: /* wgsl */ `

            struct Uniforms {
                mul: f32,
            };

            @group(0) @binding(0) var<uniform> uniforms: Uniforms;
            @group(0) @binding(1) var texture: texture_2d<f32>;
            @group(0) @binding(2) var texture_sampler: sampler;

            @fragment
            fn frag_main(@builtin(position) coord: vec4<f32>) -> @location(0) vec4<f32> {

                var c = coord.xy;
                c.y = f32(${this.ping.height / TEXTURE_DIVIDER}) - c.y;

                var color = textureLoad(texture, vec2<u32>(c * f32(${TEXTURE_DIVIDER}) / uniforms.mul), 0).rgb;
                return vec4<f32>(color, 1.0);
            }
            `,
        }),
        entryPoint: "frag_main",
        targets: [
          {
            format: "rgba16float",
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    this.renderPassDescriptor = {
      colorAttachments: [
        {
          view: ping.createView(),
          clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    } as GPURenderPassDescriptor;

    this.gui = this.initGui();
  }

  initTexture(t: GPUTexture) {
    const texture = this.device.createTexture({
      label: "texture-viewer",
      size: {
        width: t.width,
        height: t.height,
      },
      format: "rgba16float",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    return texture;
  }

  initGui() {
    const gui = useGui();

    const viewerFolder = gui.addFolder("Texture Viewer");

    // enable / disable texture viewer ( remove canvas from dom )

    // const folder = gui.addFolder('Texture Viewer');
    viewerFolder.add(guiControls, "enabled").onChange(() => {
      if (guiControls.enabled) {
        document.body.appendChild(this.canvas);
      } else {
        document.body.removeChild(this.canvas);
      }
    });

    viewerFolder.add(guiControls, "texture", ["prefilter", "ping", "pong", "down"]).onChange(() => {
      guiControls.textureHasChanged = true;
      this.changeBindGroup();
    });

    guiControls.mipLevelControl = viewerFolder
      .add(guiControls, "mipLevel", 0, this.ping.mipLevelCount - 1, 1)
      .onChange(() => this.changeBindGroup());

    this.changeBindGroup();

    return viewerFolder;
  }

  changeBindGroup() {
    let texture = this.ping;

    switch (guiControls.texture) {
      case "prefilter": {
        texture = this.prefilterTexture;
        break;
      }
      case "ping": {
        texture = this.ping;
        break;
      }
      case "pong": {
        texture = this.pong;
        break;
      }

      case "down": {
        texture = this.downsampleTexture;
        break;
      }

      default: {
        texture = this.ping;
        break;
      }
    }

    if (guiControls.textureHasChanged) {
      const gui = this.gui;

      // @ts-ignore
      guiControls.mipLevelControl.destroy();

      guiControls.mipLevel = 0;

      guiControls.mipLevelControl = gui
        .add(guiControls, "mipLevel", 0, texture.mipLevelCount - 1, 1)
        .onChange(() => this.changeBindGroup());

      guiControls.textureHasChanged = false;
    }

    const multiplier = getTextureMipMultiplier(guiControls.texture);
    this.uniformBuffer.uniforms.mul.set(Math.pow(2, guiControls.mipLevel) * multiplier);

    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer.buffer,
          },
        },
        {
          binding: 1,
          resource: texture.createView({
            baseMipLevel: guiControls.mipLevel,
            mipLevelCount: 1,
          }),
        },
        {
          binding: 2,
          resource: this.sampler,
        },
      ],
    });
  }

  render() {
    if (this.context === null) return;

    const commandEncoder = this.device.createCommandEncoder();
    const canvasTexture = this.context.getCurrentTexture();

    Object.values(this.renderPassDescriptor.colorAttachments)[0].view = canvasTexture.createView();

    const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.end();
    submitCommandBuffer(this.device, commandEncoder);

    this.uniformBuffer.updateUniformBuffer();
  }
}

export default BloomTextureViewer;
