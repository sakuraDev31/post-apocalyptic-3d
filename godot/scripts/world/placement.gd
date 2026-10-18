class_name WorldPlacement
extends RefCounted

## Deterministic Procedural Placement of Buildings, Props, and Trees per chunk

const SeededNoiseScript = preload("res://scripts/core/seeded_noise.gd")

static func hash2D(x: int, z: int, seed_val: int = 1337) -> int:
	var h = seed_val ^ (x * 374761393) ^ (z * 668265263)
	h = ((h ^ (h >> 13)) * 1274126177) & 0x7FFFFFFF
	return (h ^ (h >> 16)) & 0x7FFFFFFF

static func get_chunk_data(chunk_x: int, chunk_z: int, world_seed: int = 1337) -> Dictionary:
	var prng = SeededNoiseScript.create_prng(hash2D(chunk_x, chunk_z, world_seed))
	var chunk_size = 64.0
	var origin_x = float(chunk_x) * chunk_size
	var origin_z = float(chunk_z) * chunk_size

	var buildings: Array[Dictionary] = []
	var props: Array[Dictionary] = []
	var trees: Array[Dictionary] = []

	# 1. Spawn Chunk (0, 0): Place 3 distinct landmark buildings
	if chunk_x == 0 and chunk_z == 0:
		buildings.append({
			"archetype": "warehouse",
			"x": origin_x + 24.0,
			"z": origin_z - 14.0,
			"seed": hash2D(chunk_x, chunk_z, world_seed + 101)
		})
		buildings.append({
			"archetype": "apartment",
			"x": origin_x - 24.0,
			"z": origin_z + 18.0,
			"seed": hash2D(chunk_x, chunk_z, world_seed + 102)
		})
		buildings.append({
			"archetype": "bunker",
			"x": origin_x - 22.0,
			"z": origin_z - 24.0,
			"seed": hash2D(chunk_x, chunk_z, world_seed + 103)
		})
	else:
		# General Chunks: 0-2 buildings with min 40m spacing
		var num_buildings = prng.rand_int(0, 2)
		var arch_keys = ["brutalist", "apartment", "warehouse", "office", "bunker", "gas_station"]

		for b in num_buildings:
			var bx = origin_x + prng.rand_range(-22.0, 22.0)
			var bz = origin_z + prng.rand_range(-22.0, 22.0)
			var r = sqrt(bx * bx + bz * bz)

			# Keep road corridor clear
			if abs(bx) > 8.0 and abs(bz) > 8.0 and r > 35.0:
				var arch = prng.rand_choice(arch_keys)
				buildings.append({
					"archetype": arch,
					"x": bx,
					"z": bz,
					"seed": hash2D(chunk_x, chunk_z, world_seed + 200 + b)
				})

	# Props per chunk: Oil drums, barricades, crates
	var num_props = prng.rand_int(2, 5)
	for p in num_props:
		var px = origin_x + prng.rand_range(-26.0, 26.0)
		var pz = origin_z + prng.rand_range(-26.0, 26.0)
		var p_type = prng.rand_choice(["drum", "barricade", "crate", "light"])
		props.append({
			"type": p_type,
			"x": px,
			"z": pz,
			"seed": hash2D(chunk_x, chunk_z, world_seed + 300 + p)
		})

	# Dead trees: placed outside roads
	var num_trees = prng.rand_int(1, 4)
	for t in num_trees:
		var tx = origin_x + prng.rand_range(-25.0, 25.0)
		var tz = origin_z + prng.rand_range(-25.0, 25.0)
		if abs(tx) > 10.0 and abs(tz) > 10.0:
			trees.append({
				"x": tx,
				"z": tz,
				"seed": hash2D(chunk_x, chunk_z, world_seed + 400 + t)
			})

	return {
		"buildings": buildings,
		"props": props,
		"trees": trees
	}
