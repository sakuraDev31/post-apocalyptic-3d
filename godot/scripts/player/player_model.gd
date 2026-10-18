class_name PlayerModel
extends Node3D

## Hierarchical 1.72m Anime Survivor Character Model with named joints

# Named joint groups for PlayerAnimator
var hips: Node3D
var torso: Node3D
var chest: Node3D
var head: Node3D
var scarf: Node3D
var shoulder_l: Node3D
var elbow_l: Node3D
var shoulder_r: Node3D
var elbow_r: Node3D
var hip_l: Node3D
var knee_l: Node3D
var hip_r: Node3D
var knee_r: Node3D

func _init() -> void:
	name = "AnimeSurvivorModel"
	_build_rig()

func _build_rig() -> void:
	# Materials
	var skin_mat = _make_mat(Color(0.98, 0.86, 0.78))
	var jacket_mat = _make_mat(Color(0.18, 0.28, 0.35))
	var hair_mat = _make_mat(Color(0.88, 0.74, 0.42))
	var scarf_mat = _make_mat(Color(0.84, 0.22, 0.18))
	var pants_mat = _make_mat(Color(0.16, 0.19, 0.26))
	var boot_mat = _make_mat(Color(0.24, 0.18, 0.14))
	var cyan_mat = _make_mat(Color(0.30, 0.88, 0.96))

	# 1. Hips (Pelvis)
	hips = Node3D.new()
	hips.name = "hips"
	hips.position = Vector3(0, 0.92, 0)
	add_child(hips)
	_add_box(hips, Vector3(0.32, 0.16, 0.22), Vector3.ZERO, pants_mat)

	# 2. Torso & Chest
	torso = Node3D.new()
	torso.name = "torso"
	torso.position = Vector3(0, 0.12, 0)
	hips.add_child(torso)
	_add_box(torso, Vector3(0.30, 0.22, 0.20), Vector3(0, 0.11, 0), jacket_mat)

	chest = Node3D.new()
	chest.name = "chest"
	chest.position = Vector3(0, 0.22, 0)
	torso.add_child(chest)
	_add_box(chest, Vector3(0.34, 0.20, 0.22), Vector3(0, 0.10, 0), jacket_mat)

	# Backpack on chest back
	_add_box(chest, Vector3(0.24, 0.28, 0.14), Vector3(0, 0.10, -0.16), cyan_mat)

	# 3. Head & Scarf
	scarf = Node3D.new()
	scarf.name = "scarf"
	scarf.position = Vector3(0, 0.20, 0)
	chest.add_child(scarf)
	_add_box(scarf, Vector3(0.26, 0.08, 0.26), Vector3.ZERO, scarf_mat)

	head = Node3D.new()
	head.name = "head"
	head.position = Vector3(0, 0.12, 0)
	scarf.add_child(head)
	_add_box(head, Vector3(0.22, 0.24, 0.22), Vector3(0, 0.12, 0), skin_mat)
	# Anime hair
	_add_box(head, Vector3(0.26, 0.14, 0.26), Vector3(0, 0.20, 0), hair_mat)

	# 4. Arms
	# Left Arm
	shoulder_l = Node3D.new()
	shoulder_l.name = "shoulder_l"
	shoulder_l.position = Vector3(-0.22, 0.16, 0)
	chest.add_child(shoulder_l)
	_add_box(shoulder_l, Vector3(0.10, 0.26, 0.10), Vector3(0, -0.13, 0), jacket_mat)

	elbow_l = Node3D.new()
	elbow_l.name = "elbow_l"
	elbow_l.position = Vector3(0, -0.26, 0)
	shoulder_l.add_child(elbow_l)
	_add_box(elbow_l, Vector3(0.09, 0.24, 0.09), Vector3(0, -0.12, 0), skin_mat)

	# Right Arm
	shoulder_r = Node3D.new()
	shoulder_r.name = "shoulder_r"
	shoulder_r.position = Vector3(0.22, 0.16, 0)
	chest.add_child(shoulder_r)
	_add_box(shoulder_r, Vector3(0.10, 0.26, 0.10), Vector3(0, -0.13, 0), jacket_mat)

	elbow_r = Node3D.new()
	elbow_r.name = "elbow_r"
	elbow_r.position = Vector3(0, -0.26, 0)
	shoulder_r.add_child(elbow_r)
	_add_box(elbow_r, Vector3(0.09, 0.24, 0.09), Vector3(0, -0.12, 0), skin_mat)

	# 5. Legs
	# Left Leg
	hip_l = Node3D.new()
	hip_l.name = "hip_l"
	hip_l.position = Vector3(-0.10, 0, 0)
	hips.add_child(hip_l)
	_add_box(hip_l, Vector3(0.13, 0.42, 0.14), Vector3(0, -0.21, 0), pants_mat)

	knee_l = Node3D.new()
	knee_l.name = "knee_l"
	knee_l.position = Vector3(0, -0.42, 0)
	hip_l.add_child(knee_l)
	_add_box(knee_l, Vector3(0.12, 0.44, 0.13), Vector3(0, -0.22, 0), boot_mat)

	# Right Leg
	hip_r = Node3D.new()
	hip_r.name = "hip_r"
	hip_r.position = Vector3(0.10, 0, 0)
	hips.add_child(hip_r)
	_add_box(hip_r, Vector3(0.13, 0.42, 0.14), Vector3(0, -0.21, 0), pants_mat)

	knee_r = Node3D.new()
	knee_r.name = "knee_r"
	knee_r.position = Vector3(0, -0.42, 0)
	hip_r.add_child(knee_r)
	_add_box(knee_r, Vector3(0.12, 0.44, 0.13), Vector3(0, -0.22, 0), boot_mat)

func _make_mat(col: Color) -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.albedo_color = col
	m.roughness = 0.65
	return m

func _add_box(parent: Node3D, size: Vector3, pos: Vector3, mat: Material) -> void:
	var mi = MeshInstance3D.new()
	var box = BoxMesh.new()
	box.size = size
	mi.mesh = box
	mi.position = pos
	mi.material_override = mat
	parent.add_child(mi)
