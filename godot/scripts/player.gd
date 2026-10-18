class_name Player
extends CharacterBody3D

## Signals for HUD integration
signal stamina_changed(current: float, max_val: float)
signal health_changed(current: float, max_val: float)
signal stance_changed(is_crouching: bool)

# Physical Dimensions
@export var radius: float = 0.35
@export var standing_height: float = 1.8
@export var crouch_height: float = 1.1

# Movement Speeds (m/s)
@export var speed_walk: float = 2.2
@export var speed_run: float = 4.5
@export var speed_sprint: float = 6.5
@export var speed_crouch: float = 1.4
@export var air_control: float = 0.6
@export var turn_rate: float = deg_to_rad(540.0) # 540 deg/s

# Jump & Gravity
@export var jump_velocity: float = 6.8 # Peak ~1.15m height
@export var gravity: float = 20.0
@export var coyote_time_max: float = 0.12
@export var jump_buffer_max: float = 0.12

# Stamina & Health
@export var max_stamina: float = 100.0
@export var stamina_drain_rate: float = 18.0
@export var stamina_regen_rate: float = 12.0
@export var stamina_regen_delay: float = 1.0
@export var max_health: float = 100.0

# Current State
var health: float = 100.0
var stamina: float = 100.0
var stamina_delay_timer: float = 0.0
var sprint_locked: bool = false
var is_crouching: bool = false
var is_sprinting: bool = false

var coyote_timer: float = 0.0
var jump_buffer_timer: float = 0.0
var jump_cut_applied: bool = false

# Virtual joystick input vector from TouchHUD (or physical keys)
var external_move_vector: Vector2 = Vector2.ZERO

# Node References
@onready var collision_shape: CollisionShape3D = $CollisionShape3D
@onready var visual_mesh: Node3D = $VisualMesh
@onready var camera_rig: Node3D = $CameraRig
@onready var ceiling_check: ShapeCast3D = $CeilingCheck

const PlayerModelScript = preload("res://scripts/player/player_model.gd")
const PlayerAnimatorScript = preload("res://scripts/player/player_animator.gd")

var player_model = null
var player_animator = null

func _ready() -> void:
	add_to_group("player")
	health = max_health
	stamina = max_stamina
	floor_snap_length = 0.35
	floor_max_angle = deg_to_rad(40.0) # Clamped to 40 deg slopes

	# Initialize procedural anime scavenger character model & animator
	if visual_mesh:
		for child in visual_mesh.get_children():
			child.queue_free()
		player_model = PlayerModelScript.new()
		visual_mesh.add_child(player_model)
		player_animator = PlayerAnimatorScript.new(player_model)
	
	emit_signal("health_changed", health, max_health)
	emit_signal("stamina_changed", stamina, max_stamina)

func _physics_process(delta: float) -> void:
	# 1. Update Timers
	_update_timers(delta)

	# 2. Handle Crouch Toggle & Height Interpolation
	_handle_crouch(delta)

	# 3. Handle Stamina Drain & Regeneration
	_handle_stamina(delta)

	# 4. Gather Combined Input (Keyboard + Virtual Touch Joystick)
	var input_vec = _get_input_vector()

	# 5. Determine Target Speed
	var target_speed = _calculate_speed(input_vec)

	# 6. Apply Movement Relative to Camera
	_apply_horizontal_movement(input_vec, target_speed, delta)

	# 7. Apply Gravity & Jumping Mechanics
	_apply_vertical_movement(delta)

	# 8. Character Mesh Facing Direction
	_update_character_rotation(delta)

	# 9. Commit Physics
	move_and_slide()

	# 10. Update Procedural Skeletal Animation
	if player_animator:
		player_animator.update(delta, velocity, is_on_floor(), is_crouching, is_sprinting)

func _update_timers(delta: float) -> void:
	if is_on_floor():
		coyote_timer = coyote_time_max
		jump_cut_applied = false
	else:
		coyote_timer = max(0.0, coyote_timer - delta)

	if jump_buffer_timer > 0.0:
		jump_buffer_timer = max(0.0, jump_buffer_timer - delta)

	if stamina_delay_timer > 0.0:
		stamina_delay_timer = max(0.0, stamina_delay_timer - delta)

func _handle_crouch(delta: float) -> void:
	if Input.is_action_just_pressed("crouch"):
		if is_crouching:
			# Check overhead clearance before standing up
			if ceiling_check and not ceiling_check.is_colliding():
				is_crouching = false
				emit_signal("stance_changed", false)
		else:
			is_crouching = true
			emit_signal("stance_changed", true)

	# Interpolate CapsuleShape3D height
	if collision_shape and collision_shape.shape is CapsuleShape3D:
		var target_h = crouch_height if is_crouching else standing_height
		var capsule: CapsuleShape3D = collision_shape.shape
		capsule.height = lerp(capsule.height, target_h, delta * 15.0)

func _handle_stamina(delta: float) -> void:
	if is_sprinting:
		stamina = max(0.0, stamina - stamina_drain_rate * delta)
		stamina_delay_timer = stamina_regen_delay
		if stamina <= 5.0:
			sprint_locked = true
			is_sprinting = false
	elif stamina_delay_timer <= 0.0:
		stamina = min(max_stamina, stamina + stamina_regen_rate * delta)
		if sprint_locked and stamina >= 20.0:
			sprint_locked = false

	emit_signal("stamina_changed", stamina, max_stamina)

func _get_input_vector() -> Vector2:
	var dir = Vector2.ZERO
	# Keyboard / Gamepad actions
	var forward = Input.get_action_strength("move_forward")
	var back = Input.get_action_strength("move_backward")
	var left = Input.get_action_strength("move_left")
	var right = Input.get_action_strength("move_right")

	dir.y = forward - back
	dir.x = right - left

	# Combine with external virtual joystick from Mobile HUD
	if external_move_vector.length_squared() > 0.01:
		dir += external_move_vector

	if dir.length() > 1.0:
		dir = dir.normalized()

	return dir

func _calculate_speed(input_vec: Vector2) -> float:
	if input_vec.is_zero_approx():
		is_sprinting = false
		return 0.0

	var wants_sprint = (Input.is_action_pressed("sprint") or is_sprinting) and not is_crouching and not sprint_locked

	if wants_sprint and stamina > 5.0 and input_vec.y > 0.3:
		is_sprinting = true
		return speed_sprint
	else:
		is_sprinting = false

	if is_crouching:
		return speed_crouch

	# Default walk / run speed based on analog deflection
	return lerp(speed_walk, speed_run, clamp(input_vec.length(), 0.0, 1.0))

func _apply_horizontal_movement(input_vec: Vector2, target_speed: float, delta: float) -> void:
	var cam_transform = camera_rig.global_transform if camera_rig else global_transform
	var forward = -cam_transform.basis.z
	var right = cam_transform.basis.x
	forward.y = 0.0
	right.y = 0.0
	forward = forward.normalized()
	right = right.normalized()

	var move_dir = (right * input_vec.x + forward * input_vec.y).normalized()
	var target_vel = move_dir * target_speed

	var accel = 15.0 if is_on_floor() else (15.0 * air_control)
	velocity.x = lerp(velocity.x, target_vel.x, delta * accel)
	velocity.z = lerp(velocity.z, target_vel.z, delta * accel)

func _apply_vertical_movement(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravity * delta

	# Jump buffer input
	if Input.is_action_just_pressed("jump"):
		jump_buffer_timer = jump_buffer_max

	# Trigger Jump if within Coyote time & buffered
	if jump_buffer_timer > 0.0 and coyote_timer > 0.0:
		velocity.y = jump_velocity
		jump_buffer_timer = 0.0
		coyote_timer = 0.0

	# Variable Jump Height (cutting jump if released early)
	if Input.is_action_just_released("jump") and velocity.y > 0.0 and not jump_cut_applied:
		velocity.y *= 0.5
		jump_cut_applied = true

func _update_character_rotation(delta: float) -> void:
	var horizontal_vel = Vector2(velocity.x, velocity.z)
	if horizontal_vel.length_squared() > 0.1 and visual_mesh:
		var target_angle = atan2(-velocity.x, -velocity.z)
		visual_mesh.rotation.y = rotate_toward(visual_mesh.rotation.y, target_angle, turn_rate * delta)

## External trigger for Touch HUD jump button
func trigger_jump() -> void:
	jump_buffer_timer = jump_buffer_max

## External toggle for Touch HUD sprint button
func set_touch_sprint(active: bool) -> void:
	is_sprinting = active and not sprint_locked and stamina > 5.0

## External toggle for Touch HUD crouch button
func toggle_crouch() -> void:
	if is_crouching:
		if ceiling_check and not ceiling_check.is_colliding():
			is_crouching = false
			emit_signal("stance_changed", false)
	else:
		is_crouching = true
		emit_signal("stance_changed", true)
