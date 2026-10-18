class_name World
extends Node3D

@onready var player: CharacterBody3D = $Player
@onready var hud: CanvasLayer = $HUD
@onready var touch_controls: Control = $TouchControls
@onready var sun_light: DirectionalLight3D = $SunLight
@onready var world_env: WorldEnvironment = $WorldEnvironment

# Radiation storm system
var storm_timer: float = 0.0
var storm_active: bool = false
var storm_intensity: float = 0.0

func _ready() -> void:
	# Link Player to HUD and Touch Controls
	if player:
		if hud:
			hud.setup(player)
		if touch_controls:
			touch_controls.setup(player)
			
	# Automatically generate collision on imported city model if present
	_setup_city_collisions()

func _setup_city_collisions() -> void:
	if has_node("CityModel"):
		var city_node = get_node("CityModel")
		_create_trimesh_colliders_recursive(city_node)

func _create_trimesh_colliders_recursive(node: Node) -> void:
	if node is MeshInstance3D:
		# Create trimesh static body collision shape if it doesn't already have one
		if node.get_child_count() == 0:
			node.create_trimesh_collision()
	for child in node.get_children():
		_create_trimesh_colliders_recursive(child)

func _process(delta: float) -> void:
	_update_radiation_storm(delta)

func _update_radiation_storm(delta: float) -> void:
	storm_timer += delta
	# Cycle radiation storm every 90 seconds
	var cycle = fmod(storm_timer, 90.0)
	if cycle > 60.0:
		# Storm incoming / active for 30s
		storm_intensity = move_toward(storm_intensity, 0.75, delta * 0.15)
	else:
		storm_intensity = move_toward(storm_intensity, 0.0, delta * 0.2)
		
	if hud:
		hud.set_radiation(storm_intensity)
