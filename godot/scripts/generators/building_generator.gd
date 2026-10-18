class_name BuildingGenerator
extends RefCounted

## Generates 6 Post-Apocalyptic Architectural Archetypes with native StaticBody3D wall colliders

const SeededNoiseScript = preload("res://scripts/core/seeded_noise.gd")

static func generate_building(seed_val: int = 1337, archetype: String = "brutalist") -> Node3D:
	var root = Node3D.new()
	root.name = "Building_%s_%d" % [archetype, seed_val]

	var prng = SeededNoiseScript.create_prng(seed_val)
	var size_mult = 0.85 + prng.next_float() * 0.3

	var static_body = StaticBody3D.new()
	static_body.collision_layer = 1
	static_body.collision_mask = 2
	root.add_child(static_body)

	match archetype:
		"brutalist":
			_build_brutalist(root, static_body, size_mult, prng)
		"apartment":
			_build_apartment(root, static_body, size_mult, prng)
		"warehouse":
			_build_warehouse(root, static_body, size_mult, prng)
		"office":
			_build_office(root, static_body, size_mult, prng)
		"bunker":
			_build_bunker(root, static_body, size_mult, prng)
		"gas_station":
			_build_gas_station(root, static_body, size_mult, prng)
		_:
			_build_brutalist(root, static_body, size_mult, prng)

	return root

# Helper to create a box mesh and its StaticBody3D collider
static func _add_box(parent: Node3D, static_body: StaticBody3D, size: Vector3, pos: Vector3, mat: Material = null, make_collider: bool = true) -> MeshInstance3D:
	var mi = MeshInstance3D.new()
	var box = BoxMesh.new()
	box.size = size
	mi.mesh = box
	mi.position = pos

	if mat:
		mi.material_override = mat
	parent.add_child(mi)

	if make_collider and static_body:
		var col = CollisionShape3D.new()
		var shape = BoxShape3D.new()
		shape.size = size
		col.shape = shape
		col.position = pos
		static_body.add_child(col)

	return mi

# Materials cache
static func _get_concrete_mat() -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.albedo_color = Color(0.38, 0.39, 0.42)
	m.roughness = 0.9
	return m

static func _get_rust_mat() -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.albedo_color = Color(0.48, 0.24, 0.14)
	m.roughness = 0.85
	m.metallic = 0.3
	return m

static func _get_rebar_mat() -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.albedo_color = Color(0.22, 0.23, 0.25)
	m.metallic = 0.8
	m.roughness = 0.5
	return m

static func _build_brutalist(root: Node3D, body: StaticBody3D, mult: float, prng: RefCounted) -> void:
	var w = 8.0 * mult
	var d = 7.0 * mult
	var story_h = 3.2
	var concrete = _get_concrete_mat()
	var rebar = _get_rebar_mat()

	# 4 Corner Columns + 1 middle
	var col_s = 0.6
	var cols = [
		Vector2(-w/2 + col_s/2, -d/2 + col_s/2),
		Vector2(w/2 - col_s/2, -d/2 + col_s/2),
		Vector2(-w/2 + col_s/2, d/2 - col_s/2),
		Vector2(w/2 - col_s/2, d/2 - col_s/2)
	]

	for pt in cols:
		var h = story_h * (2.0 + prng.next_float())
		_add_box(root, body, Vector3(col_s, h, col_s), Vector3(pt.x, h/2, pt.y), concrete)
		# Protruding rebar
		_add_box(root, body, Vector3(0.05, 0.8, 0.05), Vector3(pt.x, h + 0.4, pt.y), rebar, false)

	# Ground floor walls with 1.8m doorway
	var wall_t = 0.35
	_add_box(root, body, Vector3(w, story_h, wall_t), Vector3(0, story_h/2, -d/2), concrete)
	_add_box(root, body, Vector3(wall_t, story_h, d), Vector3(-w/2, story_h/2, 0), concrete)
	_add_box(root, body, Vector3(wall_t, story_h, d), Vector3(w/2, story_h/2, 0), concrete)

	# Front wall broken into two wings with 1.8m door gap
	var door_w = 1.8
	var wing_w = (w - door_w) * 0.5
	_add_box(root, body, Vector3(wing_w, story_h, wall_t), Vector3(-w/2 + wing_w/2, story_h/2, d/2), concrete)
	_add_box(root, body, Vector3(wing_w, story_h, wall_t), Vector3(w/2 - wing_w/2, story_h/2, d/2), concrete)

	# Floor slabs
	_add_box(root, body, Vector3(w + 0.4, 0.35, d + 0.4), Vector3(0, story_h, 0), concrete)
	_add_box(root, body, Vector3(w * 0.7, 0.35, d * 0.8), Vector3(-w * 0.1, story_h * 2, 0), concrete)

static func _build_warehouse(root: Node3D, body: StaticBody3D, mult: float, prng: RefCounted) -> void:
	var w = 12.0 * mult
	var d = 16.0 * mult
	var h = 5.5
	var wall_t = 0.3
	var concrete = _get_concrete_mat()
	var rust = _get_rust_mat()

	# Back wall & sides
	_add_box(root, body, Vector3(w, h, wall_t), Vector3(0, h/2, -d/2), concrete)
	_add_box(root, body, Vector3(wall_t, h, d), Vector3(-w/2, h/2, 0), concrete)
	_add_box(root, body, Vector3(wall_t, h, d), Vector3(w/2, h/2, 0), concrete)

	# Front wall with 3.5m wide cargo doorway
	var door_w = 3.5
	var wing_w = (w - door_w) * 0.5
	_add_box(root, body, Vector3(wing_w, h, wall_t), Vector3(-w/2 + wing_w/2, h/2, d/2), concrete)
	_add_box(root, body, Vector3(wing_w, h, wall_t), Vector3(w/2 - wing_w/2, h/2, d/2), concrete)
	_add_box(root, body, Vector3(door_w, 1.2, wall_t), Vector3(0, h - 0.6, d/2), concrete)

	# Corrugated roof (partially collapsed)
	_add_box(root, body, Vector3(w * 0.6, 0.15, d * 0.8), Vector3(-w * 0.18, h, -d * 0.05), rust)

static func _build_bunker(root: Node3D, body: StaticBody3D, mult: float, prng: RefCounted) -> void:
	var w = 7.0 * mult
	var d = 6.0 * mult
	var h = 3.0
	var wall_t = 0.8 # Thick blast walls
	var concrete = _get_concrete_mat()
	var rebar = _get_rebar_mat()

	_add_box(root, body, Vector3(w, h, wall_t), Vector3(0, h/2, -d/2), concrete)
	_add_box(root, body, Vector3(wall_t, h, d), Vector3(-w/2, h/2, 0), concrete)
	_add_box(root, body, Vector3(wall_t, h, d), Vector3(w/2, h/2, 0), concrete)

	# Doorway
	var door_w = 1.4
	var wing_w = (w - door_w) * 0.5
	_add_box(root, body, Vector3(wing_w, h, wall_t), Vector3(-w/2 + wing_w/2, h/2, d/2), concrete)
	_add_box(root, body, Vector3(wing_w, h, wall_t), Vector3(w/2 - wing_w/2, h/2, d/2), concrete)

	# Roof slab + antenna
	_add_box(root, body, Vector3(w + 0.6, 0.5, d + 0.6), Vector3(0, h + 0.25, 0), concrete)
	_add_box(root, body, Vector3(0.08, 3.2, 0.08), Vector3(w/3, h + 2.1, d/3), rebar, false)

static func _build_apartment(root: Node3D, body: StaticBody3D, mult: float, prng: RefCounted) -> void:
	var w = 9.0 * mult
	var d = 8.0 * mult
	var story_h = 3.0
	var concrete = _get_concrete_mat()

	# 3-story box with front doorway
	_add_box(root, body, Vector3(w, story_h * 3, 0.35), Vector3(0, story_h * 1.5, -d/2), concrete)
	_add_box(root, body, Vector3(0.35, story_h * 3, d), Vector3(-w/2, story_h * 1.5, 0), concrete)
	_add_box(root, body, Vector3(0.35, story_h * 2, d * 0.7), Vector3(w/2, story_h, -d * 0.15), concrete)

	# Doorway
	var door_w = 1.6
	var wing_w = (w - door_w) * 0.5
	_add_box(root, body, Vector3(wing_w, story_h, 0.35), Vector3(-w/2 + wing_w/2, story_h/2, d/2), concrete)
	_add_box(root, body, Vector3(wing_w, story_h, 0.35), Vector3(w/2 - wing_w/2, story_h/2, d/2), concrete)
	_add_box(root, body, Vector3(w, 0.3, d), Vector3(0, story_h, 0), concrete)

static func _build_office(root: Node3D, body: StaticBody3D, mult: float, prng: RefCounted) -> void:
	var w = 8.5 * mult
	var d = 8.5 * mult
	var story_h = 2.8
	var concrete = _get_concrete_mat()

	# 5 Floors sheared
	for s in range(5):
		var shrink = float(s) * 0.15
		var sw = w * (1.0 - shrink)
		var sd = d * (1.0 - shrink)
		_add_box(root, body, Vector3(sw, 0.3, sd), Vector3(0, float(s + 1) * story_h, 0), concrete)
		if s == 0:
			# Ground floor walls
			_add_box(root, body, Vector3(sw, story_h, 0.3), Vector3(0, story_h/2, -sd/2), concrete)
			_add_box(root, body, Vector3(0.3, story_h, sd), Vector3(-sw/2, story_h/2, 0), concrete)
			_add_box(root, body, Vector3(0.3, story_h, sd), Vector3(sw/2, story_h/2, 0), concrete)

static func _build_gas_station(root: Node3D, body: StaticBody3D, mult: float, prng: RefCounted) -> void:
	var concrete = _get_concrete_mat()
	var rust = _get_rust_mat()

	# Canopy on 4 pillars
	var cw = 10.0 * mult
	var cd = 6.0 * mult
	var ch = 4.5
	_add_box(root, body, Vector3(cw, 0.4, cd), Vector3(0, ch, 0), rust)

	_add_box(root, body, Vector3(0.4, ch, 0.4), Vector3(-cw/3, ch/2, -cd/3), concrete)
	_add_box(root, body, Vector3(0.4, ch, 0.4), Vector3(cw/3, ch/2, -cd/3), concrete)
	_add_box(root, body, Vector3(0.4, ch, 0.4), Vector3(-cw/3, ch/2, cd/3), concrete)
	_add_box(root, body, Vector3(0.4, ch, 0.4), Vector3(cw/3, ch/2, cd/3), concrete)

	# Fuel pumps
	_add_box(root, body, Vector3(0.8, 1.4, 0.5), Vector3(-cw/4, 0.7, 0), rust)
	_add_box(root, body, Vector3(0.8, 1.4, 0.5), Vector3(cw/4, 0.7, 0), rust)

	# Small convenience shop in the back
	var sw = 5.0 * mult
	var sd = 4.0 * mult
	var sh = 3.2
	_add_box(root, body, Vector3(sw, sh, sd), Vector3(0, sh/2, -cd - sd/2), concrete)
