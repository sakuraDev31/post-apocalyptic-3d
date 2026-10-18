shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec4 rust_color : source_color = vec4(0.48, 0.22, 0.12, 1.0);
uniform vec4 base_concrete : source_color = vec4(0.35, 0.36, 0.38, 1.0);
uniform float uv_scale = 1.0;
uniform float rust_threshold : hint_range(0.0, 1.0) = 0.55;
uniform float roughness_base : hint_range(0.0, 1.0) = 0.85;

varying vec3 world_pos;
varying vec3 world_normal;

// Procedural 3D hash noise
float hash3D(vec3 p) {
	return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float noise3D(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);

	return mix(
		mix(mix(hash3D(i + vec3(0,0,0)), hash3D(i + vec3(1,0,0)), f.x),
			mix(hash3D(i + vec3(0,1,0)), hash3D(i + vec3(1,1,0)), f.x), f.y),
		mix(mix(hash3D(i + vec3(0,0,1)), hash3D(i + vec3(1,0,1)), f.x),
			mix(hash3D(i + vec3(0,1,1)), hash3D(i + vec3(1,1,1)), f.x), f.y),
		f.z
	);
}

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	// Triplanar blend weights
	vec3 weights = abs(world_normal);
	weights /= (weights.x + weights.y + weights.z);

	// Multi-octave procedural 3D noise
	float n = noise3D(world_pos * uv_scale * 0.5);
	n += 0.5 * noise3D(world_pos * uv_scale * 1.5);
	n *= 0.66;

	// Mask rust vs concrete
	float rust_mask = smoothstep(rust_threshold - 0.1, rust_threshold + 0.1, n);
	vec3 col = mix(base_concrete.rgb, rust_color.rgb, rust_mask);

	ALBEDO = col;
	ROUGHNESS = mix(roughness_base, 0.95, rust_mask);
	METALLIC = mix(0.0, 0.4, rust_mask);
}
