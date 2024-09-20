struct Uniforms {
  resolution: vec2<f32>,
  image_flat_size: vec2<f32>,
  size: f32,
  image_index: f32,
  time: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> input_images_buffer: array<f32>;

struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
};

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(1.0, 1.0)
    );

    var output: VertexOutput;
    output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
    return output;
}

fn get_flat_size() -> u32 {
    return u32(uniforms.image_flat_size.x * uniforms.image_flat_size.y);
}

fn get_image_index(coord: vec2<f32>) -> u32 {
    let X = floor(coord.x);
    let Y = floor(coord.y);
    let num_row_images = (uniforms.resolution / uniforms.image_flat_size).x;
    let index = u32(X + Y * num_row_images);
    return index;
}

fn get_local_index(coord: vec2<f32>) -> u32 {
    let X = floor(coord.x);
    let Y = floor(coord.y);
    let index = u32(X + Y * uniforms.image_flat_size.x);
    return index;
}

fn get_color(coord: vec2<f32>) -> vec4<f32> {
    let local_index = get_local_index(coord % uniforms.image_flat_size);
    let image_index = get_image_index(coord / uniforms.image_flat_size);
    let image_offset = get_flat_size() * image_index;
    let index = image_offset + local_index;
    return vec4<f32>(input_images_buffer[index]);
}

fn is_outside_bounds(coord: vec2<f32>, bounds: vec2<f32>) -> bool {
    return coord.x >= bounds.x || coord.y >= bounds.y;
}

@fragment
fn frag_main(@builtin(position) coord: vec4<f32>) -> @location(0) vec4<f32> {
    let color = get_color(coord.xy);
    return color;
}

