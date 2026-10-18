shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_toon, specular_toon;

uniform vec4 base_color : source_color = vec4(0.85, 0.85, 0.9, 1.0);
uniform sampler2D main_texture : source_color, filter_linear_mipmap;
uniform float roughness : hint_range(0.0, 1.0) = 0.6;
uniform float metallic : hint_range(0.0, 1.0) = 0.0;

// Toon Ramp Parameters
uniform vec4 shadow_color : source_color = vec4(0.35, 0.38, 0.48, 1.0);
uniform float shadow_threshold : hint_range(0.0, 1.0) = 0.45;
uniform float shadow_softness : hint_range(0.001, 0.2) = 0.05;

// Rim Lighting (Anime Silhouette Accent)
uniform vec4 rim_color : source_color = vec4(0.95, 0.9, 0.8, 1.0);
uniform float rim_threshold : hint_range(0.0, 1.0) = 0.65;
uniform float rim_spread : hint_range(0.0, 1.0) = 0.3;

void fragment() {
	vec4 tex_col = texture(main_texture, UV);
	ALBEDO = base_color.rgb * tex_col.rgb;
	ROUGHNESS = roughness;
	METALLIC = metallic;
}

void light() {
	// N dot L diffuse
	float NdotL = clamp(dot(NORMAL, LIGHT), 0.0, 1.0);
	float light_mask = smoothstep(shadow_threshold - shadow_softness, shadow_threshold + shadow_softness, NdotL);
	
	vec3 ramp_diffuse = mix(shadow_color.rgb, vec3(1.0), light_mask);
	
	// Rim Light
	float NdotV = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float rim_mask = pow(1.0 - NdotV, 3.0) * light_mask;
	vec3 rim = (rim_mask > (1.0 - rim_spread)) ? rim_color.rgb : vec3(0.0);
	
	// Final Lighting
	DIFFUSE_LIGHT += (ALBEDO * ramp_diffuse * LIGHT_COLOR * ATTENUATION) + rim;
}
