class_name TerrainGenerator
extends RefCounted

## Procedural Wasteland Terrain Generator with skirts and physics colliders

static func hash2D(x: float, z: float, seed_val: int = 1337) -> float:
	var h = sin(x * 127.1 + z * 311.7 + float(seed_val) * 74.7) * 43758.5453
	return h - floor(h)

static func smooth_noise(x: float, z: float, seed_val: int = 1337) -> float:
	var ix = floor(x)
	var iz = floor(z)
	var fx = x - ix
	var fz = z - iz
	var u = fx * fx * (3.0 - 2.0 * fx)
	var v = fz * fz * (3.0 - 2.0 * fz)

	return (
		hash2D(ix, iz, seed_val) * (1.0 - u) * (1.0 - v) +
		hash2D(ix + 1.0, iz, seed_val) * u * (1.0 - v) +
		hash2D(ix, iz + 1.0, seed_val) * (1.0 - u) * v +
		hash2D(ix + 1.0, iz + 1.0, seed_val) * u * v
	)

## Pure deterministic height function
static func get_height_at(x: float, z: float, seed_val: int = 1337) -> float:
	var r = sqrt(x * x + z * z)
	if r < 52.0:
		if r < 11.0: return 1.2
		if r < 14.0: return 1.2 * (1.0 - (r - 11.0) / 3.0)
		return 0.0

	var hill_factor = min(1.0, pow((r - 52.0) / 38.0, 1.2))
	var n = smooth_noise(x * 0.025, z * 0.025, seed_val) * 8.0 + smooth_noise(x * 0.05, z * 0.05, seed_val + 7) * 2.0
	return hill_factor * n

## Generates a terrain chunk node with mesh and StaticBody3D collider
static func generate_chunk(origin_x: float, origin_z: float, size: float = 64.0, res: int = 33, seed_val: int = 1337) -> Node3D:
	var chunk_node = Node3D.new()
	chunk_node.name = "Terrain_%d_%d" % [int(origin_x), int(origin_z)]
	chunk_node.position = Vector3(origin_x, 0, origin_z)

	var st = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var half_size = size * 0.5
	var step = size / float(res - 1)

	var c_grass_lush = Color(0.32, 0.72, 0.53)
	var c_grass_sun  = Color(0.58, 0.83, 0.70)
	var c_plaza_warm = Color(0.90, 0.80, 0.70)
	var c_road_slate = Color(0.25, 0.28, 0.35)
	var c_moss_patch = Color(0.45, 0.77, 0.61)

	# 1. Generate main grid quads
	for j in range(res - 1):
		for i in range(res - 1):
			var lx0 = -half_size + float(i) * step
			var lz0 = -half_size + float(j) * step
			var lx1 = lx0 + step
			var lz1 = lz0 + step

			var wx0 = origin_x + lx0; var wz0 = origin_z + lz0
			var wx1 = origin_x + lx1; var wz1 = origin_z + lz1

			var y00 = get_height_at(wx0, wz0, seed_val)
			var y10 = get_height_at(wx1, wz0, seed_val)
			var y01 = get_height_at(wx0, wz1, seed_val)
			var y11 = get_height_at(wx1, wz1, seed_val)

			var v00 = Vector3(lx0, y00, lz0)
			var v10 = Vector3(lx1, y10, lz0)
			var v01 = Vector3(lx0, y01, lz1)
			var v11 = Vector3(lx1, y11, lz1)

			var col00 = _get_vertex_color(wx0, wz0, y00, seed_val, c_grass_lush, c_grass_sun, c_plaza_warm, c_road_slate, c_moss_patch)
			var col10 = _get_vertex_color(wx1, wz0, y10, seed_val, c_grass_lush, c_grass_sun, c_plaza_warm, c_road_slate, c_moss_patch)
			var col01 = _get_vertex_color(wx0, wz1, y01, seed_val, c_grass_lush, c_grass_sun, c_plaza_warm, c_road_slate, c_moss_patch)
			var col11 = _get_vertex_color(wx1, wz1, y11, seed_val, c_grass_lush, c_grass_sun, c_plaza_warm, c_road_slate, c_moss_patch)

			# Quad triangle 1: v00, v10, v01
			st.set_color(col00); st.set_uv(Vector2(0, 0)); st.add_vertex(v00)
			st.set_color(col10); st.set_uv(Vector2(1, 0)); st.add_vertex(v10)
			st.set_color(col01); st.set_uv(Vector2(0, 1)); st.add_vertex(v01)

			# Quad triangle 2: v10, v11, v01
			st.set_color(col10); st.set_uv(Vector2(1, 0)); st.add_vertex(v10)
			st.set_color(col11); st.set_uv(Vector2(1, 1)); st.add_vertex(v11)
			st.set_color(col01); st.set_uv(Vector2(0, 1)); st.add_vertex(v01)

	# 2. Add border skirts (drop down 2.5m to seamlessly prevent cracks between chunks)
	var skirt_drop = 2.5
	var skirt_col = Color(0.28, 0.26, 0.24)

	# North skirt (lz = -half_size)
	for i in range(res - 1):
		var lx0 = -half_size + float(i) * step
		var lx1 = lx0 + step
		var lz = -half_size
		var y0 = get_height_at(origin_x + lx0, origin_z + lz, seed_val)
		var y1 = get_height_at(origin_x + lx1, origin_z + lz, seed_val)
		_add_skirt_quad(st, Vector3(lx0, y0, lz), Vector3(lx1, y1, lz), skirt_drop, skirt_col)

	# South skirt (lz = half_size)
	for i in range(res - 1):
		var lx0 = -half_size + float(i) * step
		var lx1 = lx0 + step
		var lz = half_size
		var y0 = get_height_at(origin_x + lx0, origin_z + lz, seed_val)
		var y1 = get_height_at(origin_x + lx1, origin_z + lz, seed_val)
		_add_skirt_quad(st, Vector3(lx1, y1, lz), Vector3(lx0, y0, lz), skirt_drop, skirt_col)

	st.generate_normals()
	var array_mesh = st.commit()

	var mesh_instance = MeshInstance3D.new()
	mesh_instance.mesh = array_mesh

	# Standard PBR material honoring vertex colors
	var mat = StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.85
	mesh_instance.material_override = mat

	chunk_node.add_child(mesh_instance)

	# Create native physics static body collider
	var static_body = StaticBody3D.new()
	static_body.collision_layer = 1
	static_body.collision_mask = 2
	var col_shape = CollisionShape3D.new()
	col_shape.shape = array_mesh.create_trimesh_shape()
	static_body.add_child(col_shape)
	chunk_node.add_child(static_body)

	return chunk_node

static func _add_skirt_quad(st: SurfaceTool, topA: Vector3, topB: Vector3, drop: float, col: Color) -> void:
	var botA = Vector3(topA.x, topA.y - drop, topA.z)
	var botB = Vector3(topB.x, topB.y - drop, topB.z)

	st.set_color(col); st.add_vertex(topA)
	st.set_color(col); st.add_vertex(botA)
	st.set_color(col); st.add_vertex(topB)

	st.set_color(col); st.add_vertex(topB)
	st.set_color(col); st.add_vertex(botA)
	st.set_color(col); st.add_vertex(botB)

static func _get_vertex_color(wx: float, wz: float, y: float, seed_val: int, c_lush: Color, c_sun: Color, c_plaza: Color, c_road: Color, c_moss: Color) -> Color:
	var r = sqrt(wx * wx + wz * wz)
	var on_main_ave = (abs(wx) < 4.8 or abs(wz) < 4.8) and r < 50.0
	var on_ring_road = abs(r - 32.0) < 3.6

	if r < 13.5:
		return c_plaza.lerp(c_moss, 0.15)
	elif on_main_ave or on_ring_road:
		return c_road
	else:
		var n_blend = smooth_noise(wx * 0.08, wz * 0.08, seed_val)
		return c_lush.lerp(c_sun, n_blend * 0.75 + (0.2 if y > 3.0 else 0.0))
