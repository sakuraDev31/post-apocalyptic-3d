class_name AutonomousDrone
extends CharacterBody3D

## Autonomous Patrol Drone with rotating rotors, searchlight cone, and AI state machine

enum DroneState { PATROL, ALERT, PURSUIT }

@export var patrol_radius: float = 24.0
@export var patrol_speed: float = 3.5
@export var pursuit_speed: float = 6.0
@export var hover_height: float = 4.5

var current_state: DroneState = DroneState.PATROL
var center_origin: Vector3 = Vector3.ZERO
var patrol_angle: float = 0.0
var rotor_nodes: Array[Node3D] = []

@onready var spotlight: SpotLight3D = $SpotLight3D
@onready var scanner_mesh: MeshInstance3D = $ScannerMesh
var player_target: Node3D = null

func _ready() -> void:
	center_origin = global_position
	rotor_nodes = [$Rotor1, $Rotor2, $Rotor3, $Rotor4]
	# Find player
	var players = get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		player_target = players[0]

func _physics_process(delta: float) -> void:
	# Spin rotors
	for r in rotor_nodes:
		r.rotation.y += delta * 25.0

	match current_state:
		DroneState.PATROL:
			_process_patrol(delta)
		DroneState.ALERT:
			_process_alert(delta)
		DroneState.PURSUIT:
			_process_pursuit(delta)

	move_and_slide()

func _process_patrol(delta: float) -> void:
	patrol_angle += delta * (patrol_speed / patrol_radius)
	var target_x = center_origin.x + cos(patrol_angle) * patrol_radius
	var target_z = center_origin.z + sin(patrol_angle) * patrol_radius
	var target_pos = Vector3(target_x, hover_height + sin(patrol_angle * 2.0) * 0.5, target_z)

	var dir = (target_pos - global_position).normalized()
	velocity = dir * patrol_speed
	look_at(global_position + dir, Vector3.UP)

	# Check detection
	if player_target:
		var dist = global_position.distance_to(player_target.global_position)
		if dist < 14.0:
			current_state = DroneState.ALERT
			_set_scanner_color(Color(1.0, 0.55, 0.1)) # Orange alert

func _process_alert(delta: float) -> void:
	if not player_target:
		current_state = DroneState.PATROL
		return

	var dist = global_position.distance_to(player_target.global_position)
	look_at(player_target.global_position, Vector3.UP)
	velocity = velocity.lerp(Vector3.ZERO, delta * 3.0)

	if dist < 10.0:
		current_state = DroneState.PURSUIT
		_set_scanner_color(Color(0.95, 0.15, 0.15)) # Red siren
	elif dist > 18.0:
		current_state = DroneState.PATROL
		_set_scanner_color(Color(0.2, 0.8, 1.0)) # Blue patrol

func _process_pursuit(delta: float) -> void:
	if not player_target:
		current_state = DroneState.PATROL
		return

	var target_pos = player_target.global_position + Vector3(0, hover_height * 0.8, 0)
	var dir = (target_pos - global_position).normalized()
	velocity = dir * pursuit_speed
	look_at(player_target.global_position, Vector3.UP)

	var dist = global_position.distance_to(player_target.global_position)
	if dist > 25.0:
		current_state = DroneState.PATROL
		_set_scanner_color(Color(0.2, 0.8, 1.0))

func _set_scanner_color(col: Color) -> void:
	if spotlight:
		spotlight.light_color = col
	if scanner_mesh and scanner_mesh.material_override is StandardMaterial3D:
		(scanner_mesh.material_override as StandardMaterial3D).albedo_color = col
