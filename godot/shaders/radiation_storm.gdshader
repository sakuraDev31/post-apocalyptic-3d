shader_type canvas_item;

uniform sampler2D SCREEN_TEXTURE : hint_screen_texture, filter_linear_mipmap;
uniform float radiation_intensity : hint_range(0.0, 1.0) = 0.0;
uniform float grain_speed = 24.0;
uniform float chromatic_aberration = 0.005;

// Pseudo-random noise generator
float random(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	if (radiation_intensity <= 0.001) {
		COLOR = texture(SCREEN_TEXTURE, SCREEN_UV);
	} else {
		vec2 uv = SCREEN_UV;
		
		// Chromatic Aberration
		float aberration = chromatic_aberration * radiation_intensity;
		float r = texture(SCREEN_TEXTURE, uv + vec2(aberration, 0.0)).r;
		float g = texture(SCREEN_TEXTURE, uv).g;
		float b = texture(SCREEN_TEXTURE, uv - vec2(aberration, 0.0)).b;
		vec3 base_color = vec3(r, g, b);

		// Geiger Film Grain
		vec2 grain_uv = uv + vec2(sin(TIME * grain_speed), cos(TIME * grain_speed * 1.3));
		float grain = (random(grain_uv * 1000.0) - 0.5) * 0.35 * radiation_intensity;
		base_color += vec3(grain);

		// Radiation Vignette (dark amber/sickly green edge darkening)
		vec2 center_dist = (uv - 0.5) * 1.8;
		float vignette = clamp(1.0 - dot(center_dist, center_dist), 0.0, 1.0);
		vec3 tint = mix(vec3(0.18, 0.22, 0.12), vec3(1.0), vignette);
		base_color *= mix(vec3(1.0), tint, radiation_intensity * 0.7);

		COLOR = vec4(base_color, 1.0);
	}
}
