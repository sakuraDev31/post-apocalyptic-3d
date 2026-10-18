class_name PlayerAnimator
extends RefCounted

## Procedural skeletal animator: breathing, locomotion cycle, lean, crouch, jump squash

var model: Node3D = null
var cycle_time: float = 0.0

func _init(player_model: Node3D = null) -> void:
	model = player_model

func update(delta: float, velocity: Vector3, is_grounded: bool, is_crouching: bool, is_sprinting: bool) -> void:
	if not model:
		return

	var horizontal_speed = Vector2(velocity.x, velocity.z).length()

	# 1. Air / Jump Stance
	if not is_grounded:
		_animate_air(delta)
		return

	# 2. Crouch Stance
	if is_crouching:
		_animate_crouch(delta, horizontal_speed)
		return

	# 3. Ground Locomotion or Idle
	if horizontal_speed > 0.1:
		var stride_freq = 8.0 if is_sprinting else (5.5 if horizontal_speed > 3.0 else 4.0)
		cycle_time += delta * stride_freq
		_animate_run(cycle_time, horizontal_speed, is_sprinting)
	else:
		cycle_time += delta * 2.0
		_animate_idle(cycle_time)

func _animate_idle(t: float) -> void:
	var breath = sin(t) * 0.04
	model.torso.position.y = 0.12 + breath * 0.5
	model.chest.rotation.x = breath * 0.5
	model.head.rotation.x = -breath * 0.3

	# Relaxed arm sway
	model.shoulder_l.rotation.x = sin(t * 0.8) * 0.05
	model.shoulder_r.rotation.x = -sin(t * 0.8) * 0.05
	model.hip_l.rotation.x = 0.0
	model.hip_r.rotation.x = 0.0
	model.knee_l.rotation.x = 0.0
	model.knee_r.rotation.x = 0.0

func _animate_run(t: float, speed: float, sprinting: bool) -> void:
	var stride_amp = 0.7 if sprinting else (0.5 if speed > 3.0 else 0.35)
	var swing = sin(t) * stride_amp

	# Legs swing reciprocally
	model.hip_l.rotation.x = swing
	model.hip_r.rotation.x = -swing

	# Knees bend on backswing
	model.knee_l.rotation.x = max(0.0, -swing * 1.2)
	model.knee_r.rotation.x = max(0.0, swing * 1.2)

	# Arms swing opposite to legs
	var arm_amp = stride_amp * 0.9
	model.shoulder_l.rotation.x = -swing * arm_amp
	model.shoulder_r.rotation.x = swing * arm_amp
	model.elbow_l.rotation.x = -0.4
	model.elbow_r.rotation.x = -0.4

	# Torso bob
	model.torso.position.y = 0.12 + abs(cos(t * 2.0)) * 0.04
	model.chest.rotation.z = -sin(t) * 0.05 # Spine lean

func _animate_crouch(delta: float, speed: float) -> void:
	model.hips.position.y = lerp(model.hips.position.y, 0.65, delta * 10.0)
	model.hip_l.rotation.x = deg_to_rad(-40.0)
	model.hip_r.rotation.x = deg_to_rad(-40.0)
	model.knee_l.rotation.x = deg_to_rad(65.0)
	model.knee_r.rotation.x = deg_to_rad(65.0)
	model.chest.rotation.x = deg_to_rad(25.0) # Forward lean

func _animate_air(delta: float) -> void:
	model.hips.position.y = lerp(model.hips.position.y, 0.92, delta * 6.0)
	model.hip_l.rotation.x = deg_to_rad(-25.0)
	model.hip_r.rotation.x = deg_to_rad(15.0)
	model.knee_l.rotation.x = deg_to_rad(45.0)
	model.knee_r.rotation.x = deg_to_rad(20.0)
	model.shoulder_l.rotation.z = deg_to_rad(-20.0) # Arms spread
	model.shoulder_r.rotation.z = deg_to_rad(20.0)
