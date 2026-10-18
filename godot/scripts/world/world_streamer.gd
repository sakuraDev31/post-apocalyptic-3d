class_name WorldStreamer
extends Node3D

## Infinite Procedural World Streaming Manager (LODs, Chunk caching, Budgeted spawning)

const TerrainGen = preload("res://scripts/generators/terrain_generator.gd")
const PlacementGen = preload("res://scripts/world/placement.gd")
const BuildingGen = preload("res://scripts/generators/building_generator.gd")
const PropsGen = preload("res://scripts/generators/props_generator.gd")
const TreeGen = preload("res://scripts/generators/tree_generator.gd")

@export var world_seed: int = 1337
@export var chunk_size: float = 64.0
@export var view_radius: int = 1 # 1 = 3x3 chunks (9 chunks total), 2 = 5x5 chunks

var player_ref: Node3D = null
var current_chunk_coords: Vector2i = Vector2i(9999, 9999)
var active_chunks: Dictionary = {} # Vector2i -> Node3D
var load_queue: Array[Vector2i] = []

func setup(player: Node3D) -> void:
	player_ref = player

func _process(_delta: float) -> void:
	if not player_ref:
		return

	var px = player_ref.global_position.x
	var pz = player_ref.global_position.z
	var cx = int(floor((px + chunk_size * 0.5) / chunk_size))
	var cz = int(floor((pz + chunk_size * 0.5) / chunk_size))
	var player_coords = Vector2i(cx, cz)

	# 1. Update queue if player moved to new chunk
	if player_coords != current_chunk_coords:
		current_chunk_coords = player_coords
		_update_streaming_window(player_coords)

	# 2. Budget: Spawn at most 1 chunk per frame
	if not load_queue.is_empty():
		var target_coord = load_queue.pop_front()
		if not active_chunks.has(target_coord):
			_load_chunk(target_coord.x, target_coord.y)

func _update_streaming_window(center: Vector2i) -> void:
	var required_coords: Dictionary = {}

	for dz in range(-view_radius, view_radius + 1):
		for dx in range(-view_radius, view_radius + 1):
			var c = Vector2i(center.x + dx, center.y + dz)
			required_coords[c] = true
			if not active_chunks.has(c) and not load_queue.has(c):
				load_queue.append(c)

	# Unload out-of-range chunks
	var to_remove: Array[Vector2i] = []
	for c in active_chunks.keys():
		if not required_coords.has(c):
			to_remove.append(c)

	for c in to_remove:
		var node = active_chunks[c]
		active_chunks.erase(c)
		node.queue_free()

func _load_chunk(cx: int, cz: int) -> void:
	var origin_x = float(cx) * chunk_size
	var origin_z = float(cz) * chunk_size

	var chunk_root = Node3D.new()
	chunk_root.name = "Chunk_%d_%d" % [cx, cz]
	add_child(chunk_root)
	active_chunks[Vector2i(cx, cz)] = chunk_root

	# 1. Generate Terrain Mesh + Collider
	var terrain_node = TerrainGen.generate_chunk(origin_x, origin_z, chunk_size, 33, world_seed)
	chunk_root.add_child(terrain_node)

	# 2. Get Deterministic Placement Data
	var data = PlacementGen.get_chunk_data(cx, cz, world_seed)

	# 3. Spawn Buildings
	for b in data["buildings"]:
		var b_node = BuildingGen.generate_building(b["seed"], b["archetype"])
		var by = TerrainGen.get_height_at(b["x"], b["z"], world_seed)
		b_node.position = Vector3(b["x"], by, b["z"])
		chunk_root.add_child(b_node)

	# 4. Spawn Props
	for p in data["props"]:
		var p_node: Node3D = null
		match p["type"]:
			"drum":
				p_node = PropsGen.generate_oil_drum(p["seed"])
			"barricade":
				p_node = PropsGen.generate_barricade(p["seed"])
			"crate":
				p_node = PropsGen.generate_crate(p["seed"])
			"light":
				p_node = PropsGen.generate_streetlight(p["seed"])
			_:
				p_node = PropsGen.generate_oil_drum(p["seed"])

		if p_node:
			var py = TerrainGen.get_height_at(p["x"], p["z"], world_seed)
			p_node.position = Vector3(p["x"], py, p["z"])
			chunk_root.add_child(p_node)

	# 5. Spawn Dead Trees
	for t in data["trees"]:
		var t_node = TreeGen.generate_tree(t["seed"])
		var ty = TerrainGen.get_height_at(t["x"], t["z"], world_seed)
		t_node.position = Vector3(t["x"], ty, t["z"])
		chunk_root.add_child(t_node)
