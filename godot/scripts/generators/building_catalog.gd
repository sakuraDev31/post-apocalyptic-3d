class_name BuildingCatalog
extends RefCounted

const ARCHETYPES = [
	{ "id": 1, "key": "brutalist", "name": "Brutalist Block" },
	{ "id": 2, "key": "apartment", "name": "Low-Rise Apartment" },
	{ "id": 3, "key": "warehouse", "name": "Industrial Warehouse" },
	{ "id": 4, "key": "office", "name": "Sheared Office Tower" },
	{ "id": 5, "key": "bunker", "name": "Concrete Military Bunker" },
	{ "id": 6, "key": "gas_station", "name": "Derelict Gas Station" }
]

static func get_archetype_by_key(key: String) -> Dictionary:
	for a in ARCHETYPES:
		if a["key"] == key:
			return a
	return ARCHETYPES[0]

static func get_archetype_by_id(id_num: int) -> Dictionary:
	for a in ARCHETYPES:
		if a["id"] == id_num:
			return a
	return ARCHETYPES[0]
