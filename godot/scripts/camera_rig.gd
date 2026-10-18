class_name CameraRig
extends Node3D

## Dual-mode 3rd Person Camera (Shoulder & Overhead)
@export var min_pitch: float = deg_to_rad(-40.0)
@export var max_pitch: float = deg_to_rad(80.0)
@export var sensitivity: float = 0.003
@export var zoom_speed: float = 5.0

# Distance per stance
@export var dist_stand: float = 3.0
@export var dist_crouch: float = 2.4
@export var dist_sprint: float = 3.5
@export var dist_overhead: float = 10.0

# Offset
@export var shoulder_offset_x: float = 0.45

var is_overhead: bool = false
var current_pitch: float = deg_to_rad(12.0)
var current_yaw: float = 0.0

@onready var spring_arm: SpringArm3D = $SpringArm3D
@onready var camera: Camera3D = $SpringArm3D/Camera3D

func _ready() -> void:
	# Keep spring arm updated
	spring_arm.spring_length = dist_stand
	spring_arm.add_excluded_object(get_parent().get_rid())

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.get_mouse_mode() == Input.MOUSE_MODE_CAPTURED:
		apply_look_rotation(event.relative)
	
	if Input.is_action_just_pressed("toggle_camera"):
		toggle_camera_mode()

func apply_look_rotation(delta: Vector2) -> void:
	current_yaw -= delta.x * sensitivity
	current_pitch = clamp(current_pitch - delta.y * sensitivity, min_pitch, max_pitch)
	
	rotation.y = current_yaw
	spring_arm.rotation.x = current_pitch

func toggle_camera_mode() -> void:
	is_overhead = not is_overhead
	if is_overhead:
		current_pitch = deg_to_rad(70.0)
		spring_arm.spring_length = dist_overhead
		camera.position.x = 0.0
	else:
		current_pitch = deg_to_rad(12.0)
		spring_arm.spring_length = dist_stand
		camera.position.x = shoulder_offset_x
	
	spring_arm.rotation.x = current_pitch

func update_zoom(target_dist: float, delta: float) -> void:
	if not is_overhead:
		spring_arm.spring_length = lerp(spring_arm.spring_length, target_dist, delta * zoom_speed)
