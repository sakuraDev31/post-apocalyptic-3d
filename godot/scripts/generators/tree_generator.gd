class_name TreeGenerator
extends RefCounted

## Procedural Dead Gnarled Tree Generator with branching and trunk collider

const SeededNoiseScript = preload("res://scripts/core/seeded_noise.gd")

static func generate_tree(seed_val: int = 1337) -> Node3D:
	var root = Node3D.new()
	root.name = "DeadTree_%d" % seed_val

	var prng = SeededNoiseScript.create_prng(seed_val)
	var body = StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 2
	root.add_child(body)

	var bark_mat = StandardMaterial3D.new()
	bark_mat.albedo_color = Color(0.22, 0.18, 0.16)
	bark_mat.roughness = 0.95

	# Main Trunk
	var trunk_h = 3.8 + prng.next_float() * 1.5
	var base_r = 0.35
	var top_r = 0.22

	var trunk_mi = MeshInstance3D.new()
	var cyl = CylinderMesh.new()
	cyl.bottom_radius = base_r
	cyl.top_radius = top_r
	cyl.height = trunk_h
	trunk_mi.mesh = cyl
	trunk_mi.position.y = trunk_h * 0.5
	trunk_mi.rotation.z = deg_to_rad(prng.rand_range(-5.0, 5.0))
	trunk_mi.material_override = bark_mat
	root.add_child(trunk_mi)

	var col = CollisionShape3D.new()
	var col_shape = CylinderShape3D.new()
	col_shape.radius = base_r
	col_shape.height = trunk_h
	col.shape = col_shape
	col.position.y = trunk_h * 0.5
	body.add_child(col)

	# 3 Gnarled Branches
	for b in 3:
		var branch_mi = MeshInstance3D.new()
		var b_cyl = CylinderMesh.new()
		var b_len = 1.8 + prng.next_float() * 1.0
		b_cyl.bottom_radius = 0.15
		b_cyl.top_radius = 0.04
		b_cyl.height = b_len
		branch_mi.mesh = b_cyl
		branch_mi.position = Vector3(0, trunk_h * 0.75, 0)
		branch_mi.rotation = Vector3(
			deg_to_rad(prng.rand_range(-35.0, 35.0)),
			float(b) * (TAU / 3.0) + deg_to_rad(prng.rand_range(-20.0, 20.0)),
			deg_to_rad(prng.rand_range(30.0, 55.0))
		)
		branch_mi.material_override = bark_mat
		root.add_child(branch_mi)

	return root
