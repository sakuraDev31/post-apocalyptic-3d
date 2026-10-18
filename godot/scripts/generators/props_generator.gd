class_name PropsGenerator
extends RefCounted

## Procedural Props Generator with physics colliders

static func generate_oil_drum(seed_val: int = 1337) -> Node3D:
	var root = Node3D.new()
	root.name = "OilDrum_%d" % seed_val

	var body = StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 2
	root.add_child(body)

	var radius = 0.35
	var height = 0.95

	var mi = MeshInstance3D.new()
	var cyl = CylinderMesh.new()
	cyl.top_radius = radius
	cyl.bottom_radius = radius
	cyl.height = height
	mi.mesh = cyl
	mi.position.y = height * 0.5

	var rust_mat = StandardMaterial3D.new()
	rust_mat.albedo_color = Color(0.52, 0.22, 0.12)
	rust_mat.roughness = 0.8
	rust_mat.metallic = 0.3
	mi.material_override = rust_mat
	root.add_child(mi)

	var col = CollisionShape3D.new()
	var shape = CylinderShape3D.new()
	shape.radius = radius
	shape.height = height
	col.shape = shape
	col.position.y = height * 0.5
	body.add_child(col)

	return root

static func generate_barricade(seed_val: int = 1337) -> Node3D:
	var root = Node3D.new()
	root.name = "Barricade_%d" % seed_val

	var body = StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 2
	root.add_child(body)

	var size = Vector3(2.4, 0.85, 0.6)
	var mi = MeshInstance3D.new()
	var box = BoxMesh.new()
	box.size = size
	mi.mesh = box
	mi.position.y = size.y * 0.5

	var concrete = StandardMaterial3D.new()
	concrete.albedo_color = Color(0.42, 0.42, 0.45)
	concrete.roughness = 0.9
	mi.material_override = concrete
	root.add_child(mi)

	var col = CollisionShape3D.new()
	var shape = BoxShape3D.new()
	shape.size = size
	col.shape = shape
	col.position.y = size.y * 0.5
	body.add_child(col)

	return root

static func generate_crate(seed_val: int = 1337) -> Node3D:
	var root = Node3D.new()
	root.name = "LootCrate_%d" % seed_val

	var body = StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 2
	root.add_child(body)

	var size = Vector3(0.9, 0.8, 0.9)
	var mi = MeshInstance3D.new()
	var box = BoxMesh.new()
	box.size = size
	mi.mesh = box
	mi.position.y = size.y * 0.5

	var scrap = StandardMaterial3D.new()
	scrap.albedo_color = Color(0.35, 0.38, 0.32)
	scrap.roughness = 0.7
	scrap.metallic = 0.5
	mi.material_override = scrap
	root.add_child(mi)

	var col = CollisionShape3D.new()
	var shape = BoxShape3D.new()
	shape.size = size
	col.shape = shape
	col.position.y = size.y * 0.5
	body.add_child(col)

	return root

static func generate_streetlight(seed_val: int = 1337) -> Node3D:
	var root = Node3D.new()
	root.name = "Streetlight_%d" % seed_val

	var body = StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 2
	root.add_child(body)

	var steel = StandardMaterial3D.new()
	steel.albedo_color = Color(0.28, 0.3, 0.32)
	steel.metallic = 0.7
	steel.roughness = 0.6

	# Vertical pole
	var pole_h = 5.2
	var pole_mi = MeshInstance3D.new()
	var cyl = CylinderMesh.new()
	cyl.top_radius = 0.08
	cyl.bottom_radius = 0.12
	cyl.height = pole_h
	pole_mi.mesh = cyl
	pole_mi.position.y = pole_h * 0.5
	pole_mi.rotation.z = deg_to_rad(6.0) # Bent pole
	pole_mi.material_override = steel
	root.add_child(pole_mi)

	var col = CollisionShape3D.new()
	var shape = CylinderShape3D.new()
	shape.radius = 0.15
	shape.height = pole_h
	col.shape = shape
	col.position.y = pole_h * 0.5
	body.add_child(col)

	# Horizontal bent arm
	var arm_mi = MeshInstance3D.new()
	var arm_box = BoxMesh.new()
	arm_box.size = Vector3(1.4, 0.08, 0.08)
	arm_mi.mesh = arm_box
	arm_mi.position = Vector3(0.7, pole_h, 0)
	arm_mi.material_override = steel
	root.add_child(arm_mi)

	return root
